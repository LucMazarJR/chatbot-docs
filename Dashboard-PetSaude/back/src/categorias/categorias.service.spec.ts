import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from '../activity/activity.service';
import { Faq } from '../faqs/schemas/faq.schema';
import { CategoriasService } from './categorias.service';
import { chaveDeCategoria } from './chave';
import { Categoria } from './schemas/categoria.schema';

/**
 * A taxonomia de assuntos.
 *
 * LÓGICA DO LUCIANO: o que estes testes travam é a diferença entre "esta FAQ
 * está com o assunto errado" e "esta FAQ está com o assunto certo escrito de
 * outro jeito". As duas apareciam misturadas na base — 236 categorias para 2491
 * FAQs — e são trabalhos completamente diferentes: a primeira precisa de alguém
 * da saúde decidindo, a segunda se resolve sozinha. Se a classificação escorrega
 * de um lado para o outro, a fila de curadoria deixa de ser útil.
 */
describe('chaveDeCategoria', () => {
  it('junta o que só difere por caixa, acento e espaço', () => {
    const esperada = 'exames de sangue';
    expect(chaveDeCategoria('Exames de Sangue')).toBe(esperada);
    expect(chaveDeCategoria('EXAMES DE SANGUE')).toBe(esperada);
    expect(chaveDeCategoria('  exames  de sangue ')).toBe(esperada);
  });

  it('ignora acento na comparacao, que e o caso das duplicatas da base', () => {
    expect(chaveDeCategoria('Medicação')).toBe(chaveDeCategoria('medicacao'));
  });

  it('trata nulo como vazio em vez de estourar', () => {
    expect(chaveDeCategoria(null)).toBe('');
    expect(chaveDeCategoria(undefined)).toBe('');
  });
});

describe('CategoriasService', () => {
  let service: CategoriasService;
  let categorias: any[];
  let faqs: any[];
  let categoriaModel: any;
  let bulkWrite: jest.Mock;

  /** O que o $group da revisão devolveria para as FAQs do teste. */
  const agrupadas = () => {
    const mapa = new Map<string, { _id: string; count: number; exemplos: any[] }>();
    for (const f of faqs) {
      const chave = f.category ?? '';
      const grupo = mapa.get(chave) ?? { _id: chave, count: 0, exemplos: [] };
      grupo.count += 1;
      grupo.exemplos.push({ id: f._id, question: f.question });
      mapa.set(chave, grupo);
    }
    return [...mapa.values()];
  };

  beforeEach(async () => {
    categorias = [];
    faqs = [];
    bulkWrite = jest.fn();

    const consulta = (resultado: () => any) => ({
      select: () => consulta(resultado),
      lean: () => consulta(resultado),
      exec: jest.fn(async () => resultado()),
    });

    categoriaModel = {
      find: jest.fn(() => consulta(() => categorias)),
      findOne: jest.fn((filtro: any) =>
        consulta(() => categorias.find((c) => c.chave === filtro.chave) ?? null),
      ),
      findById: jest.fn(),
    };

    const faqModel = {
      aggregate: jest.fn((pipeline: any[]) => ({
        exec: jest.fn(async () =>
          // A revisão pede `exemplos` no $group; a contagem, não.
          pipeline.some((e) => e.$group?.exemplos)
            ? agrupadas()
            : agrupadas().map(({ _id, count }) => ({ _id, count })),
        ),
      })),
      find: jest.fn(() => consulta(() => faqs)),
      bulkWrite,
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriasService,
        { provide: getModelToken(Categoria.name), useValue: categoriaModel },
        { provide: getModelToken(Faq.name), useValue: faqModel },
        { provide: ActivityService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = modulo.get(CategoriasService);
  });

  describe('revisao', () => {
    it('separa a variante de grafia do assunto que nao existe na lista', async () => {
      categorias = [{ _id: '1', nome: 'Exames', chave: 'exames', ativa: true }];
      faqs = [
        { _id: 'a', question: 'Preciso de jejum?', category: 'Exames' },
        { _id: 'b', question: 'Posso beber agua?', category: 'exames' },
        { _id: 'c', question: 'Onde fica a UBS?', category: 'Unidades' },
      ];

      const r = await service.revisao();

      // A FAQ com a grafia oficial não é problema nenhum e não entra.
      expect(r.grupos.map((g) => g.categoria).sort()).toEqual(['Unidades', 'exames']);

      const variante = r.grupos.find((g) => g.categoria === 'exames');
      expect(variante?.motivo).toBe('variante');
      expect(variante?.sugestao).toBe('Exames');

      const fora = r.grupos.find((g) => g.categoria === 'Unidades');
      expect(fora?.motivo).toBe('fora_da_lista');
      expect(fora?.sugestao).toBeUndefined();
    });

    it('marca como inativa a FAQ de um assunto aposentado, e nao como fora da lista', async () => {
      categorias = [{ _id: '1', nome: 'Exames', chave: 'exames', ativa: false }];
      faqs = [{ _id: 'a', question: 'Preciso de jejum?', category: 'Exames' }];

      const r = await service.revisao();

      expect(r.grupos[0].motivo).toBe('inativa');
    });

    it('avisa que a lista esta vazia, em vez de acusar a base inteira', async () => {
      categorias = [];
      faqs = [{ _id: 'a', question: 'Preciso de jejum?', category: 'Exames' }];

      const r = await service.revisao();

      expect(r.listaVazia).toBe(true);
    });

    it('poe primeiro o assunto que afeta mais perguntas', async () => {
      categorias = [];
      faqs = [
        { _id: 'a', question: 'Q1', category: 'Raro' },
        { _id: 'b', question: 'Q2', category: 'Comum' },
        { _id: 'c', question: 'Q3', category: 'Comum' },
      ];

      const r = await service.revisao();

      expect(r.grupos[0].categoria).toBe('Comum');
      expect(r.resumo.faqs).toBe(3);
    });
  });

  describe('criar', () => {
    it('recusa o mesmo assunto escrito de outro jeito', async () => {
      categorias = [{ _id: '1', nome: 'Exames', chave: 'exames', ativa: true }];

      await expect(
        service.criar({ nome: 'EXAMES' }, { name: 'Fulano' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('atualizar', () => {
    /** O documento do Mongoose que o findById devolve, com save(). */
    const doc = (dados: any) => ({
      ...dados,
      save: jest.fn(async function (this: any) {
        return this;
      }),
      deleteOne: jest.fn(),
    });

    it('renomeia nas FAQs e devolve quantas ficaram para reindexar', async () => {
      const alvo = doc({
        _id: '507f1f77bcf86cd799439011',
        nome: 'exames',
        chave: 'exames',
        ativa: true,
      });
      categoriaModel.findById = jest.fn(() => ({ exec: jest.fn(async () => alvo) }));
      faqs = [
        { _id: 'a', question: 'Q1', answer: 'R1', category: 'exames' },
        { _id: 'b', question: 'Q2', answer: 'R2', category: 'EXAMES' },
        { _id: 'c', question: 'Q3', answer: 'R3', category: 'Unidades' },
      ];

      const r = await service.atualizar(
        '507f1f77bcf86cd799439011',
        { nome: 'Exames' },
        { name: 'Fulano' },
      );

      // As duas grafias de "exames" viram a oficial; "Unidades" não é tocada.
      expect(r.renomeadas).toBe(2);
      expect(r.reindexar).toBe(2);

      const operacoes = bulkWrite.mock.calls[0][0];
      expect(operacoes).toHaveLength(2);
      // O `text` vai junto: é o que o Vector Store devolve como trecho.
      expect(operacoes[0].updateOne.update.$set.text).toBe(
        'Assunto: Exames\nPergunta: Q1\nResposta: R1',
      );
    });

    it('nao mexe nas FAQs quando so a descricao muda', async () => {
      const alvo = doc({
        _id: '507f1f77bcf86cd799439011',
        nome: 'Exames',
        chave: 'exames',
        ativa: true,
      });
      categoriaModel.findById = jest.fn(() => ({ exec: jest.fn(async () => alvo) }));
      faqs = [{ _id: 'a', question: 'Q1', answer: 'R1', category: 'Exames' }];

      const r = await service.atualizar(
        '507f1f77bcf86cd799439011',
        { descricao: 'Tudo sobre exames' },
        { name: 'Fulano' },
      );

      expect(r.reindexar).toBe(0);
      expect(bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('recusa excluir assunto em uso, para nao orfanar as FAQs', async () => {
      const alvo = {
        _id: '507f1f77bcf86cd799439011',
        nome: 'Exames',
        chave: 'exames',
        deleteOne: jest.fn(),
      };
      categoriaModel.findById = jest.fn(() => ({ exec: jest.fn(async () => alvo) }));
      faqs = [{ _id: 'a', question: 'Q1', category: 'Exames' }];

      await expect(
        service.remover('507f1f77bcf86cd799439011', { name: 'Fulano' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(alvo.deleteOne).not.toHaveBeenCalled();
    });
  });
});
