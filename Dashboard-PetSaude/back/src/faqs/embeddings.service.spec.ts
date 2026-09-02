import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { GeminiService } from '../gemini/gemini.service';
import { JobsService } from '../jobs/jobs.service';
import { EmbeddingsService } from './embeddings.service';
import { Faq } from './schemas/faq.schema';

/**
 * Diagnóstico e reindexação dos vetores.
 *
 * LÓGICA DO LUCIANO: o diagnóstico por amostragem existe porque a pergunta "a
 * base está no gemini-embedding-2 ou ainda no 001?" NÃO pode ser respondida
 * pelos dados. O campo embedding_model só passou a ser escrito recentemente, e
 * a dimensão não distingue os dois modelos — o 001 também produz 3072 quando
 * pedido. Comparar um vetor novo com o guardado é a única resposta honesta, e
 * estes testes travam os limiares dessa resposta.
 */
describe('EmbeddingsService — diagnostico por amostragem', () => {
  let service: EmbeddingsService;
  let gerarEmbedding: jest.Mock;
  let amostra: any[];

  /** Vetor unitário numa direção, para o cosseno ser previsível. */
  const vetor = (angulo: number) => [Math.cos(angulo), Math.sin(angulo), 0];

  beforeEach(async () => {
    amostra = [];
    gerarEmbedding = jest.fn();

    const model = {
      aggregate: jest.fn(() => ({ exec: jest.fn(async () => amostra) })),
      countDocuments: jest.fn(() => ({ exec: jest.fn(async () => 0) })),
      find: jest.fn(),
      updateOne: jest.fn(),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: getModelToken(Faq.name), useValue: model },
        {
          provide: GeminiService,
          useValue: { gerarEmbedding, modeloAtual: 'gemini-embedding-2', dimensoes: 3 },
        },
        { provide: JobsService, useValue: {} },
      ],
    }).compile();

    service = modulo.get(EmbeddingsService);
  });

  it('conclui "mesmo modelo" quando os vetores praticamente coincidem', async () => {
    amostra = [{ question: 'Q1?', text: 'Assunto: x', embedding: vetor(0) }];
    gerarEmbedding.mockResolvedValue(vetor(0));

    const r = await service.diagnosticar(1);

    expect(r.veredito).toBe('mesmo_modelo');
    expect(r.similaridadeMedia).toBeCloseTo(1, 3);
  });

  it('conclui "modelo diferente" quando os vetores nao se parecem', async () => {
    amostra = [{ question: 'Q1?', text: 'Assunto: x', embedding: vetor(0) }];
    gerarEmbedding.mockResolvedValue(vetor(Math.PI / 2));

    const r = await service.diagnosticar(1);

    expect(r.veredito).toBe('modelo_diferente');
    expect(r.explicacao).toContain('reindexar');
  });

  it('nao afirma nada na faixa intermediaria', async () => {
    // Semelhanca no meio pode ser diferenca de texto canonico (FAQ antiga
    // embedada sem o assunto na frente), nao de modelo. Chutar aqui levaria
    // alguem a reindexar 2451 FAQs, tres dias de cota, sem precisar.
    amostra = [{ question: 'Q1?', text: 'Assunto: x', embedding: vetor(0) }];
    gerarEmbedding.mockResolvedValue(vetor(0.44));

    const r = await service.diagnosticar(1);

    expect(r.veredito).toBe('inconclusivo');
  });

  it('para de amostrar quando a cota acaba, com o que ja tem', async () => {
    amostra = [
      { question: 'Q1?', text: 't', embedding: vetor(0) },
      { question: 'Q2?', text: 't', embedding: vetor(0) },
      { question: 'Q3?', text: 't', embedding: vetor(0) },
    ];
    gerarEmbedding
      .mockResolvedValueOnce(vetor(0))
      .mockRejectedValueOnce(new Error('429 quota exceeded'));

    const r = await service.diagnosticar(3);

    expect(r.amostradas).toBe(1);
    expect(gerarEmbedding).toHaveBeenCalledTimes(2);
  });

  it('diz que e inconclusivo quando nao ha o que comparar', async () => {
    amostra = [];

    const r = await service.diagnosticar(10);

    expect(r.veredito).toBe('inconclusivo');
    expect(r.amostradas).toBe(0);
    // Sem chamada de API: nao ha por que gastar cota para descobrir isso.
    expect(gerarEmbedding).not.toHaveBeenCalled();
  });

  it('reconstroi o texto canonico quando a FAQ nao tem o campo text', async () => {
    // FAQ antiga pode nao ter o campo. Embedar so a pergunta produziria uma
    // semelhanca baixa e um veredito de "modelo diferente" que seria mentira.
    amostra = [
      {
        question: 'Preciso de jejum?',
        answer: 'Sim, 8 horas.',
        category: 'exames',
        embedding: vetor(0),
      },
    ];
    gerarEmbedding.mockResolvedValue(vetor(0));

    await service.diagnosticar(1);

    expect(gerarEmbedding).toHaveBeenCalledWith(
      'Assunto: exames\nPergunta: Preciso de jejum?\nResposta: Sim, 8 horas.',
    );
  });
});

describe('EmbeddingsService — backfill', () => {
  let service: EmbeddingsService;
  let jobs: JobsService;
  let gerarEmbedding: jest.Mock;
  let updateOne: jest.Mock;
  let docs: any[];

  async function esperarFim(jobId: string) {
    for (let i = 0; i < 200; i++) {
      const job = jobs.buscar(jobId);
      if (job.estado !== 'rodando') return job;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error('o job nao terminou');
  }

  beforeEach(async () => {
    docs = [];
    gerarEmbedding = jest.fn(async () => [0.1, 0.2, 0.3]);
    updateOne = jest.fn(() => ({ exec: jest.fn(async () => ({})) }));

    const model = {
      aggregate: jest.fn(() => ({ exec: jest.fn(async () => []) })),
      countDocuments: jest.fn(() => ({ exec: jest.fn(async () => docs.length) })),
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn(async () => docs),
      })),
      updateOne,
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        JobsService,
        { provide: getModelToken(Faq.name), useValue: model },
        {
          provide: GeminiService,
          useValue: { gerarEmbedding, modeloAtual: 'gemini-embedding-2', dimensoes: 3 },
        },
      ],
    }).compile();

    service = modulo.get(EmbeddingsService);
    jobs = modulo.get(JobsService);
  });

  const faq = (n: number) => ({
    _id: 'id-' + n,
    question: 'Pergunta ' + n,
    answer: 'Resposta ' + n,
    category: 'exames',
    content_hash: 'hash-' + n,
    text: 'texto antigo e desatualizado',
  });

  it('grava vetor e procedencia, e corrige o campo text junto', async () => {
    docs = [faq(1)];

    const { jobId } = await service.iniciarBackfill('faltantes', 10, { name: 'Ana' });
    await esperarFim(jobId);

    // Reconstroi o canonico em vez de reaproveitar o `text` guardado: se o
    // conteudo foi editado e o text ficou para tras, reaproveita-lo geraria um
    // vetor novo para o texto errado -- o defeito que o backfill existe para
    // corrigir.
    expect(gerarEmbedding).toHaveBeenCalledWith(
      'Assunto: exames\nPergunta: Pergunta 1\nResposta: Resposta 1',
    );

    const patch = updateOne.mock.calls[0][1].$set;
    expect(patch.text).toBe('Assunto: exames\nPergunta: Pergunta 1\nResposta: Resposta 1');
    expect(patch.embedding_model).toBe('gemini-embedding-2');
    expect(patch.embedding_dim).toBe(3);
    expect(patch.embedding_content_hash).toBe('hash-1');
  });

  it('para na cota e diz que rodar de novo retoma', async () => {
    docs = [faq(1), faq(2), faq(3)];
    gerarEmbedding
      .mockResolvedValueOnce([0.1, 0.2, 0.3])
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'));

    const { jobId } = await service.iniciarBackfill('tudo', 10, { name: 'Ana' });
    const job = await esperarFim(jobId);

    expect(job.estado).toBe('cota_esgotada');
    expect(job.contadores.atualizadas).toBe(1);
    expect(job.mensagem).toContain('retoma');
  });

  it('falha passageira nao para o lote', async () => {
    docs = [faq(1), faq(2)];
    gerarEmbedding
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce([0.1, 0.2, 0.3]);

    const { jobId } = await service.iniciarBackfill('tudo', 10, { name: 'Ana' });
    const job = await esperarFim(jobId);

    expect(job.estado).toBe('concluido');
    expect(job.contadores.falhas).toBe(1);
    expect(job.contadores.atualizadas).toBe(1);
    // O erro identifica a FAQ pela pergunta: sem isso, "1 falha" nao diz qual.
    expect(job.erros[0].mensagem).toContain('Pergunta 1');
  });

  it('nao deixa dois backfills rodarem juntos', async () => {
    // Dois ao mesmo tempo gastariam a cota em dobro no mesmo conteudo.
    docs = [faq(1), faq(2)];

    // Segura a primeira chamada de embedding para o job ficar de fato rodando
    // enquanto o segundo tenta comecar.
    let liberar: (v: number[]) => void = () => { };
    gerarEmbedding.mockImplementationOnce(
      () => new Promise<number[]>((resolve) => { liberar = resolve; }),
    );

    const { jobId } = await service.iniciarBackfill('tudo', 10, { name: 'Ana' });

    await expect(service.iniciarBackfill('tudo', 10, { name: 'Bia' })).rejects.toThrow(
      /ja existe um trabalho/i,
    );

    liberar([0.1, 0.2, 0.3]);
    await esperarFim(jobId);
  });
});
