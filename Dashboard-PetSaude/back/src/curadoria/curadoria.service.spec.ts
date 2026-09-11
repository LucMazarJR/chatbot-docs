import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from '../activity/activity.service';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { Mensagem } from '../conversas/schemas/mensagem.schema';
import { FaqsService } from '../faqs/faqs.service';
import { GeminiService } from '../gemini/gemini.service';
import { JobsService } from '../jobs/jobs.service';
import { CuradoriaService } from './curadoria.service';
import { Sugestao } from './schemas/sugestao.schema';

/**
 * A fila de perguntas sem resposta.
 *
 * LÓGICA DO LUCIANO: o que estes testes protegem é a rastreabilidade e a ordem
 * das escritas. Uma sugestão sem origem é uma frase solta que ninguém consegue
 * conferir; e marcar a lacuna como tratada antes de a sugestão existir apagaria
 * a pergunta da fila sem deixar nada no lugar — ela nunca mais seria analisada,
 * e nada indicaria isso.
 */
describe('CuradoriaService', () => {
  let service: CuradoriaService;
  let mensagens: any[];
  let salvas: any[];
  let updateMany: jest.Mock;
  let gerarJson: jest.Mock;
  let createFaq: jest.Mock;
  let jobs: any;

  const consulta = (resultado: () => any) => {
    const encadeado: any = {
      sort: () => encadeado,
      limit: () => encadeado,
      select: () => encadeado,
      lean: () => encadeado,
      exec: jest.fn(async () => resultado()),
    };
    return encadeado;
  };

  /** Casa o filtro do service com a lista de mensagens do teste. */
  const filtrar = (filtro: any) => {
    if (filtro?.papel === 'user') {
      const ids = filtro.correlationId.$in;
      return mensagens.filter((m) => m.papel === 'user' && ids.includes(m.correlationId));
    }
    return mensagens.filter(
      (m) => m.semResposta === true && (m.curadoria === null || m.curadoria === 'pendente'),
    );
  };

  beforeEach(async () => {
    mensagens = [];
    salvas = [];
    updateMany = jest.fn(() => ({ exec: jest.fn(async () => ({})) }));
    gerarJson = jest.fn();
    createFaq = jest.fn(async () => ({ ok: true, id: 'faq-nova', semEmbedding: false }));

    const mensagemModel = {
      find: jest.fn((filtro: any) => consulta(() => filtrar(filtro))),
      countDocuments: jest.fn(() => ({ exec: jest.fn(async () => filtrar({}).length) })),
      updateMany,
    };

    // `new this.sugestaoModel(...)` precisa de um construtor, não de um objeto.
    const sugestaoModel: any = function (this: any, dados: any) {
      this.save = jest.fn(async () => {
        salvas.push(dados);
        return dados;
      });
    };
    sugestaoModel.find = jest.fn(() => consulta(() => []));
    sugestaoModel.findById = jest.fn();

    jobs = {
      criar: jest.fn(() => ({ id: 'job-1' })),
      incrementar: jest.fn(),
      avancar: jest.fn(),
      finalizar: jest.fn(),
      registrarErro: jest.fn(),
      foiPedidoParar: jest.fn(() => false),
      doTipo: jest.fn(),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        CuradoriaService,
        { provide: getModelToken(Mensagem.name, CONEXAO_PROTOTIPO), useValue: mensagemModel },
        { provide: getModelToken(Sugestao.name), useValue: sugestaoModel },
        {
          provide: GeminiService,
          useValue: { gerarJson, modeloDeTexto: 'gemini-3.1-flash-lite' },
        },
        { provide: JobsService, useValue: jobs },
        { provide: FaqsService, useValue: { createFaq } },
        { provide: ActivityService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = modulo.get(CuradoriaService);
  });

  /** Um par pergunta/resposta como o PWA grava. */
  const troca = (n: number, pergunta: string, extra: Record<string, unknown> = {}) => {
    mensagens.push({
      _id: `u${n}`,
      papel: 'user',
      texto: pergunta,
      correlationId: `c${n}`,
    });
    mensagens.push({
      _id: `b${n}`,
      papel: 'bot',
      sessaoId: `s${n}`,
      correlationId: `c${n}`,
      em: new Date(2026, 0, n),
      semResposta: true,
      curadoria: null,
      trechosDebug: [
        { faqId: 'faq-1', question: 'FAQ vizinha', score: 0.81, previa: 'texto', usado: false },
      ],
      ...extra,
    });
  };

  describe('fila', () => {
    it('junta a pergunta do cidadao a resposta que falhou, pelo correlationId', async () => {
      troca(1, 'Onde fica a UBS?');

      const fila = await service.listarFila();

      expect(fila).toHaveLength(1);
      expect(fila[0].pergunta).toBe('Onde fica a UBS?');
      expect(fila[0].mensagemId).toBe('b1');
      // As FAQs vizinhas vêm do que ficou gravado, sem nova busca.
      expect(fila[0].vizinhas[0].faqId).toBe('faq-1');
    });

    it('descarta a lacuna cuja pergunta nao existe mais', async () => {
      mensagens.push({
        _id: 'b9',
        papel: 'bot',
        sessaoId: 's9',
        correlationId: 'c9',
        em: new Date(),
        semResposta: true,
        curadoria: null,
        trechosDebug: [],
      });

      expect(await service.listarFila()).toHaveLength(0);
    });

    it('conta como pendente o que ainda nao tem o campo curadoria', async () => {
      troca(1, 'Onde fica a UBS?');
      troca(2, 'Como chego la?');

      const r = await service.contarPendentes();

      expect(r.pendentes).toBe(2);
      expect(r.prontoParaRodar).toBe(false);
      expect(r.tamanhoDaRodada).toBe(10);
    });
  });

  describe('rodada', () => {
    it('agrupa as perguntas e guarda a origem de cada uma', async () => {
      troca(1, 'Onde fica a UBS?');
      troca(2, 'Qual o endereco do posto?');
      gerarJson.mockResolvedValue({
        grupos: [
          {
            perguntas: [1, 2],
            pergunta: 'Onde fica a UBS?',
            resposta: '',
            tags: ['ubs', 'endereco', 'unidade'],
            tipo: 'nova',
            justificativa: 'A base nao tem endereco de unidade.',
          },
        ],
      });

      service.iniciarRodada({ name: 'Ana' });
      await new Promise((r) => setImmediate(r));

      expect(salvas).toHaveLength(1);
      expect(salvas[0].origens.map((o: any) => o.mensagemId)).toEqual(['b1', 'b2']);
      expect(salvas[0].origens[0].pergunta).toBe('Onde fica a UBS?');
      // Resposta vazia é resultado correto: significa conteúdo que falta.
      expect(salvas[0].rascunhoResposta).toBe('');
    });

    it('descarta grupo que nao aponta para nenhuma pergunta real', async () => {
      troca(1, 'Onde fica a UBS?');
      gerarJson.mockResolvedValue({
        grupos: [{ perguntas: [47], pergunta: 'Inventada' }],
      });

      service.iniciarRodada({ name: 'Ana' });
      await new Promise((r) => setImmediate(r));

      expect(salvas).toHaveLength(0);
      expect(jobs.incrementar).toHaveBeenCalledWith('job-1', 'descartados');
    });

    // A fila real nao e so conteudo faltando: entre as 17 primeiras lacunas
    // gravadas estavam "qual o melhor time de futebol do brasil?" e "Hoje fiz
    // muita coisa". Sem esta saida, a tela de aprovacao encheria de lixo na
    // primeira vez que alguem a abrisse.
    it('encerra a pergunta fora de escopo sem criar sugestao', async () => {
      troca(1, 'qual o melhor time de futebol do brasil?');
      troca(2, 'Onde fica a UBS?');
      gerarJson.mockResolvedValue({
        grupos: [
          { perguntas: [1], pergunta: '', tipo: 'fora_de_escopo', justificativa: 'nao e saude' },
          { perguntas: [2], pergunta: 'Onde fica a UBS?', tipo: 'nova' },
        ],
      });

      service.iniciarRodada({ name: 'Ana' });
      await new Promise((r) => setImmediate(r));

      expect(salvas).toHaveLength(1);
      expect(salvas[0].pergunta).toBe('Onde fica a UBS?');

      // Os dois estados ficam distintos: é a única medida de quanto do "não
      // encontrou" é lacuna de verdade.
      const chamadas = updateMany.mock.calls;
      expect(chamadas).toContainEqual([
        { _id: { $in: ['b2'] } },
        { $set: { curadoria: 'processada' } },
      ]);
      expect(chamadas).toContainEqual([
        { _id: { $in: ['b1'] } },
        { $set: { curadoria: 'descartada' } },
      ]);
    });

    it('NAO tira a lacuna da fila quando a analise falha', async () => {
      troca(1, 'Onde fica a UBS?');
      gerarJson.mockRejectedValue(new Error('modelo fora do ar'));

      service.iniciarRodada({ name: 'Ana' });
      await new Promise((r) => setImmediate(r));

      expect(updateMany).not.toHaveBeenCalled();
      expect(jobs.finalizar).toHaveBeenCalledWith('job-1', 'erro', 'modelo fora do ar');
    });

    it('reconhece o fim da cota e deixa tudo na fila', async () => {
      troca(1, 'Onde fica a UBS?');
      gerarJson.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

      service.iniciarRodada({ name: 'Ana' });
      await new Promise((r) => setImmediate(r));

      expect(updateMany).not.toHaveBeenCalled();
      expect(jobs.finalizar.mock.calls[0][1]).toBe('cota_esgotada');
    });

    it('marca como processada so depois de as sugestoes existirem', async () => {
      troca(1, 'Onde fica a UBS?');
      gerarJson.mockResolvedValue({
        grupos: [{ perguntas: [1], pergunta: 'Onde fica a UBS?' }],
      });

      service.iniciarRodada({ name: 'Ana' });
      await new Promise((r) => setImmediate(r));

      expect(salvas).toHaveLength(1);
      expect(updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['b1'] } },
        { $set: { curadoria: 'processada' } },
      );
    });
  });

  describe('aprovar', () => {
    const pendente = () => ({
      _id: '507f1f77bcf86cd799439011',
      estado: 'pendente',
      pergunta: 'Onde fica a UBS?',
      save: jest.fn(async () => undefined),
    });

    it('recusa aprovar com a resposta vazia', async () => {
      const doc = pendente();
      (service as any).sugestaoModel.findById = jest.fn(() => ({
        exec: jest.fn(async () => doc),
      }));

      await expect(
        service.aprovar(
          '507f1f77bcf86cd799439011',
          { question: 'Onde fica a UBS?', answer: '   ' },
          { name: 'Ana' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createFaq).not.toHaveBeenCalled();
    });

    it('cria a FAQ pelo caminho de sempre, com quem aprovou como autor', async () => {
      const doc = pendente();
      (service as any).sugestaoModel.findById = jest.fn(() => ({
        exec: jest.fn(async () => doc),
      }));

      const r = await service.aprovar(
        '507f1f77bcf86cd799439011',
        { question: 'Onde fica a UBS?', answer: 'Fica na rua X.', tags: ['ubs'] },
        { name: 'Ana', id: 'u-1' },
      );

      expect(r.faqId).toBe('faq-nova');
      expect(createFaq.mock.calls[0][1]).toEqual({ name: 'Ana', id: 'u-1' });
      expect(doc.estado).toBe('aprovada');
      expect(doc.save).toHaveBeenCalled();
    });
  });
});
