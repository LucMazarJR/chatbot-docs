import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';

import { FaqsService } from '../faqs/faqs.service';
import { JobsService } from '../jobs/jobs.service';
import { ImportService } from './import.service';

/**
 * Classificação das linhas antes de gravar.
 *
 * LÓGICA DO LUCIANO: a prévia existe para a pessoa ver o problema ANTES de a
 * base ser mexida. Se a classificação errar, ela erra em silêncio — a tela
 * mostra tudo verde e o defeito só aparece no chatbot, semanas depois. Por isso
 * cada estado tem teste próprio, incluindo os dois tipos de duplicata.
 */
describe('ImportService — validacao', () => {
  let service: ImportService;
  let hashesNaBase: Set<string>;

  const hash = (q: string, a: string) =>
    createHash('md5').update(`${q}|${a}`, 'utf8').digest('hex');

  /** Uma FAQ que passa em tudo, para os testes mexerem só no que interessa. */
  const boa = (extra: Record<string, unknown> = {}) => ({
    question: 'Preciso de jejum para o exame?',
    answer: 'Sim, o jejum recomendado e de 8 horas.',
    category: 'exames',
    tags: ['jejum', 'sangue', 'coleta'],
    source: 'Cartilha MS',
    ...extra,
  });

  beforeEach(async () => {
    hashesNaBase = new Set();

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        {
          provide: FaqsService,
          useValue: {
            hashDeConteudo: hash,
            hashesExistentes: jest.fn(async (lista: string[]) =>
              new Set(lista.filter((h) => hashesNaBase.has(h))),
            ),
            createFaq: jest.fn(),
          },
        },
        { provide: JobsService, useValue: {} },
      ],
    }).compile();

    service = modulo.get(ImportService);
  });

  it('aceita uma FAQ completa', async () => {
    const r = await service.validar([boa({ linha: 7 })]);

    expect(r.itens[0].estado).toBe('ok');
    expect(r.itens[0].motivos).toEqual([]);
    expect(r.itens[0].linha).toBe(7);
    expect(r.resumo).toEqual({ total: 1, ok: 1, duplicadas: 0, invalidas: 0 });
  });

  it('marca como duplicada o que ja existe na base', async () => {
    hashesNaBase.add(hash(boa().question, boa().answer));

    const r = await service.validar([boa()]);

    expect(r.itens[0].estado).toBe('duplicada');
  });

  it('conta a FAQ desativada como duplicada tambem', async () => {
    // A exclusao no dashboard e um soft delete. Ignorar a desativada aqui faria
    // a importacao reinserir o que alguem excluiu de proposito, e a base ficaria
    // com duas linhas de mesmo content_hash, uma ativa e uma nao.
    hashesNaBase.add(hash(boa().question, boa().answer));

    const r = await service.validar([boa()]);

    expect(r.itens[0].motivos[0]).toContain('ja existem na base');
  });

  it('pega a repeticao dentro do proprio arquivo', async () => {
    // O banco nao tem restricao de unicidade em content_hash: sem esta
    // verificacao, a mesma pergunta repetida na planilha entra duas vezes e a
    // copia so aparece quando alguem estranhar a contagem.
    const r = await service.validar([boa(), boa()]);

    expect(r.itens[0].estado).toBe('ok');
    expect(r.itens[1].estado).toBe('duplicada');
    expect(r.itens[1].motivos[0]).toContain('proprio arquivo');
  });

  it('exige as mesmas 3 tags que o formulario manual exige', async () => {
    const r = await service.validar([boa({ tags: ['jejum', 'sangue'] })]);

    expect(r.itens[0].estado).toBe('invalida');
    expect(r.itens[0].motivos[0]).toContain('ao menos 3 tags');
  });

  it('nao deixa tag repetida contar como tag a mais', async () => {
    const r = await service.validar([boa({ tags: ['jejum', 'jejum', 'jejum'] })]);

    expect(r.itens[0].estado).toBe('invalida');
    expect(r.itens[0].faq.tags).toEqual(['jejum']);
  });

  it('recusa pergunta igual a resposta', async () => {
    // A guarda existe desde a FAQ com pergunta, resposta e categoria
    // literalmente "teste", que foi indexada e citada numa conversa real.
    const r = await service.validar([
      boa({ question: 'mesma coisa aqui', answer: 'Mesma Coisa Aqui' }),
    ]);

    expect(r.itens[0].motivos).toContain('A pergunta e a resposta sao iguais.');
  });

  it('recusa pergunta ou resposta curta demais', async () => {
    const r = await service.validar([boa({ question: 'oi', answer: 'ok' })]);

    expect(r.itens[0].motivos).toHaveLength(2);
  });

  it('recusa assunto vazio', async () => {
    const r = await service.validar([boa({ category: '' })]);

    expect(r.itens[0].motivos[0]).toContain('assunto');
  });

  it('aponta quais tags estao fora do tamanho', async () => {
    const r = await service.validar([boa({ tags: ['jejum', 'x', 'coleta'] })]);

    expect(r.itens[0].motivos[0]).toContain('x');
  });

  it('nao consulta o banco por linhas que ja sao invalidas', async () => {
    const faqs = service as any;
    const r = await service.validar([boa({ tags: [] }), boa()]);

    // A lista do $in fica so com o que tem chance de entrar.
    expect(faqs.faqsService.hashesExistentes).toHaveBeenCalledWith([
      hash(boa().question, boa().answer),
    ]);
    expect(r.resumo).toEqual({ total: 2, ok: 1, duplicadas: 0, invalidas: 1 });
  });

  describe('o script devolveu algo torto', () => {
    it('aceita tags como string separada por virgula', async () => {
      const r = await service.validar([boa({ tags: 'jejum, sangue, coleta' })]);

      expect(r.itens[0].estado).toBe('ok');
      expect(r.itens[0].faq.tags).toEqual(['jejum', 'sangue', 'coleta']);
    });

    it('nao quebra com campos faltando', async () => {
      const r = await service.validar([{} as any]);

      expect(r.itens[0].estado).toBe('invalida');
      expect(r.itens[0].motivos.length).toBeGreaterThan(0);
    });

    it('nao quebra com tipos errados', async () => {
      const r = await service.validar([
        { question: 12345, answer: null, category: 7, tags: 3 } as any,
      ]);

      expect(r.itens[0].estado).toBe('invalida');
    });

    it('cai para a posicao no array quando o script nao informa a linha', async () => {
      const r = await service.validar([boa(), boa({ question: 'Outra pergunta aqui?' })]);

      expect(r.itens[1].linha).toBe(2);
    });

    it('normaliza assunto e tags para minusculas', async () => {
      const r = await service.validar([
        boa({ category: 'Exames', tags: ['Jejum', 'SANGUE', 'Coleta'] }),
      ]);

      expect(r.itens[0].faq.category).toBe('exames');
      expect(r.itens[0].faq.tags).toEqual(['jejum', 'sangue', 'coleta']);
    });
  });

  it('gera o mesmo content_hash que a ingestao Python', async () => {
    // O MD5 de "pergunta|resposta" e o que torna a importacao retomavel: e por
    // ele que uma reimportacao do mesmo arquivo pula o que ja entrou. Divergir
    // do gerar_hash_conteudo do enviar_dados.py quebraria a deduplicacao entre
    // os dois caminhos, sem erro nenhum.
    const r = await service.validar([boa()]);

    expect(r.itens[0].contentHash).toBe(
      createHash('md5')
        .update('Preciso de jejum para o exame?|Sim, o jejum recomendado e de 8 horas.', 'utf8')
        .digest('hex'),
    );
  });
});

/**
 * A gravação do lote.
 *
 * LÓGICA DO LUCIANO: o comportamento que mais importa aqui não é o caminho
 * feliz — é o que acontece quando a cota da API do Gemini acaba no meio. Sem a
 * parada, o laço continua e grava centenas de FAQs com vetor vazio: elas entram
 * na base, aparecem na listagem, e o chatbot simplesmente nunca as encontra.
 * Não há erro em lugar nenhum, e ninguém percebe até alguém estranhar que uma
 * pergunta nunca é respondida.
 */
describe('ImportService — gravacao do lote', () => {
  let service: ImportService;
  let jobs: JobsService;
  let createFaq: jest.Mock;

  const hash = (q: string, a: string) =>
    createHash('md5').update(`${q}|${a}`, 'utf8').digest('hex');

  const faqDaLinha = (n: number) => ({
    question: `Pergunta numero ${n} sobre saude?`,
    answer: `Resposta numero ${n}, com texto suficiente.`,
    category: 'exames',
    tags: ['jejum', 'sangue', 'coleta'],
    source: '',
    linha: n,
  });

  const commit = (faqs: any[]) => ({
    faqs,
    nomeArquivo: 'faqs-agosto.xlsx',
    scriptId: '11111111-2222-3333-4444-555555555555',
    scriptVersion: 3,
  });

  /** Espera o job sair de "rodando" — ele roda solto, sem await. */
  async function esperarFim(jobId: string) {
    for (let i = 0; i < 200; i++) {
      const job = jobs.buscar(jobId);
      if (job.estado !== 'rodando') return job;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error('o job nao terminou');
  }

  beforeEach(async () => {
    createFaq = jest.fn(async () => ({ ok: true, id: 'x', semEmbedding: false }));

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        JobsService,
        {
          provide: FaqsService,
          useValue: {
            hashDeConteudo: hash,
            hashesExistentes: jest.fn(async () => new Set<string>()),
            createFaq,
          },
        },
      ],
    }).compile();

    service = modulo.get(ImportService);
    jobs = modulo.get(JobsService);
  });

  it('insere as linhas boas e devolve o jobId na hora', async () => {
    const { jobId, total } = service.iniciarImportacao(
      commit([faqDaLinha(2), faqDaLinha(3)]),
      { name: 'Ana' },
    );

    expect(total).toBe(2);
    const job = await esperarFim(jobId);
    expect(job.estado).toBe('concluido');
    expect(job.contadores.inseridas).toBe(2);
    expect(createFaq).toHaveBeenCalledTimes(2);
  });

  it('marca a origem em cada FAQ, com script e linha', async () => {
    const { jobId } = service.iniciarImportacao(commit([faqDaLinha(7)]), { name: 'Ana' });
    await esperarFim(jobId);

    expect(createFaq).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'Ana' },
      {
        file_id: 'dashboard_import',
        file_origin: 'faqs-agosto.xlsx',
        import_script_id: '11111111-2222-3333-4444-555555555555',
        import_script_version: 3,
        line_reference: 7,
      },
    );
  });

  it('para na primeira recusa por cota, em vez de gravar o resto sem vetor', async () => {
    createFaq
      .mockResolvedValueOnce({ ok: true, id: '1', semEmbedding: false })
      .mockResolvedValueOnce({ ok: true, id: '2', semEmbedding: true, falha: 'cota' });

    const { jobId } = service.iniciarImportacao(
      commit([faqDaLinha(2), faqDaLinha(3), faqDaLinha(4), faqDaLinha(5)]),
      { name: 'Ana' },
    );
    const job = await esperarFim(jobId);

    expect(job.estado).toBe('cota_esgotada');
    expect(createFaq).toHaveBeenCalledTimes(2);
    // A mensagem precisa dizer o que fazer: reenviar o mesmo arquivo depois
    // pula o que ja entrou, porque a deduplicacao e por content_hash.
    expect(job.mensagem).toContain('reenvie o mesmo arquivo');
  });

  it('conta separado o que entrou sem vetor por falha passageira', async () => {
    createFaq.mockResolvedValue({ ok: true, id: '1', semEmbedding: true, falha: 'outra' });

    const { jobId } = service.iniciarImportacao(commit([faqDaLinha(2)]), { name: 'Ana' });
    const job = await esperarFim(jobId);

    // Falha passageira nao para o lote — mas a tela precisa oferecer gerar os
    // vetores que faltaram, senao essas FAQs ficam invisiveis para o chatbot.
    expect(job.estado).toBe('concluido');
    expect(job.contadores.inseridas).toBe(1);
    expect(job.contadores.semEmbedding).toBe(1);
  });

  it('revalida no servidor em vez de confiar na previa do navegador', async () => {
    // A previa roda no navegador. Um cliente pode mandar no commit exatamente
    // as linhas que ela marcou como invalidas.
    const { jobId } = service.iniciarImportacao(
      commit([faqDaLinha(2), { ...faqDaLinha(3), tags: [] }]),
      { name: 'Ana' },
    );
    const job = await esperarFim(jobId);

    expect(createFaq).toHaveBeenCalledTimes(1);
    expect(job.contadores.invalidas).toBe(1);
    expect(job.erros[0].linha).toBe(3);
  });

  it('nao deixa duas importacoes rodarem ao mesmo tempo', async () => {
    // Duas do mesmo arquivo competiriam pela mesma verificacao de duplicata, e
    // as duas achariam que cada linha e nova.
    const { jobId } = service.iniciarImportacao(commit([faqDaLinha(2)]), { name: 'Ana' });

    expect(() => service.iniciarImportacao(commit([faqDaLinha(3)]), { name: 'Bia' })).toThrow(
      /ja existe um trabalho/i,
    );

    await esperarFim(jobId);
  });

  it('para quando pedem para parar, sem desfazer o que ja entrou', async () => {
    const { jobId } = service.iniciarImportacao(
      commit(Array.from({ length: 40 }, (_, i) => faqDaLinha(i + 2))),
      { name: 'Ana' },
    );

    jobs.solicitarParada(jobId);
    const job = await esperarFim(jobId);

    expect(job.estado).toBe('parado');
    expect(job.mensagem).toContain('continuam na base');
  });
});
