import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from '../activity/activity.service';
import { GeminiService } from '../gemini/gemini.service';
import { Faq } from './schemas/faq.schema';
import { FaqsService } from './faqs.service';

/**
 * Listagem paginada.
 *
 * LÓGICA DO LUCIANO: os dois primeiros testes cobrem defeitos que já
 * aconteceram e que não dão erro visível — um derruba a requisição só quando o
 * cidadão digita um caractere específico, o outro faz linhas se repetirem entre
 * páginas. Ambos passariam despercebidos numa revisão de código.
 */
describe('FaqsService — listagem paginada', () => {
  let service: FaqsService;
  let ultimaConsulta: any;
  let ultimaOrdenacao: any;
  let ultimoSkip: number;
  let ultimoLimit: number;

  beforeEach(async () => {
    ultimaConsulta = undefined;
    ultimaOrdenacao = undefined;

    const cadeia = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn(function (this: any, s: any) {
        ultimaOrdenacao = s;
        return this;
      }),
      skip: jest.fn(function (this: any, n: number) {
        ultimoSkip = n;
        return this;
      }),
      limit: jest.fn(function (this: any, n: number) {
        ultimoLimit = n;
        return this;
      }),
      exec: jest.fn().mockResolvedValue([]),
    };

    const model = {
      find: jest.fn((filtro: any) => {
        ultimaConsulta = filtro;
        return cadeia;
      }),
      countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
      aggregate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        FaqsService,
        { provide: getModelToken(Faq.name), useValue: model },
        { provide: ActivityService, useValue: { logActivity: jest.fn() } },
        { provide: GeminiService, useValue: { gerarEmbedding: jest.fn() } },
      ],
    }).compile();

    service = modulo.get(FaqsService);
  });

  it('nao filtra por regex vazia quando o termo e so pontuacao', async () => {
    // A normalização remove pontuação, então "(" vira "". Testar o termo cru
    // deixava passar um `new RegExp('')`, que casa com TUDO: a busca devolvia a
    // coleção inteira como se nenhum filtro tivesse sido aplicado.
    await service.listFaqs({ search: '(' });

    expect(ultimaConsulta.$or).toBeUndefined();
  });

  it('monta uma regex valida para qualquer entrada', async () => {
    await service.listFaqs({ search: 'exame (zinco)' });

    const padrao = ultimaConsulta.$or[0].question_normalized;
    expect(padrao).toBeInstanceOf(RegExp);
    expect(() => new RegExp(padrao.source)).not.toThrow();
  });

  it('aceita qualquer entrada sem estourar', async () => {
    for (const termo of ['exame (zinco)', 'a+b', '.*', 'a|b', '((((']) {
      await expect(service.listFaqs({ search: termo })).resolves.toBeDefined();
    }
  });

  it('desempata a ordenacao pelo _id, senao paginas repetem linhas', async () => {
    await service.listFaqs({ page: 2 });

    // A ingestão grava lotes inteiros com o mesmo updatedAt. Sem um critério
    // estável de desempate, a ordem varia entre consultas e a virada de página
    // duplica ou pula documentos.
    expect(ultimaOrdenacao).toEqual({ updatedAt: -1, _id: -1 });
  });

  it('calcula o skip a partir da pagina', async () => {
    await service.listFaqs({ page: 3, limit: 20 });

    expect(ultimoSkip).toBe(40);
    expect(ultimoLimit).toBe(20);
  });

  it('limita o tamanho da pagina mesmo se pedirem mais', async () => {
    // O DTO já limita, mas o service é chamado de outros lugares e não deveria
    // confiar em quem chama.
    await service.listFaqs({ limit: 5000 });

    expect(ultimoLimit).toBe(100);
  });

  it('trata pagina zero ou negativa como a primeira', async () => {
    await service.listFaqs({ page: 0 });
    expect(ultimoSkip).toBe(0);

    await service.listFaqs({ page: -3 });
    expect(ultimoSkip).toBe(0);
  });

  it('lista so as ativas', async () => {
    await service.listFaqs({});

    expect(ultimaConsulta).toEqual(expect.objectContaining({ isActive: true }));
  });

  it('trata "sem categoria" como ausencia de categoria, nao como nome', async () => {
    await service.listFaqs({ category: FaqsService.SEM_CATEGORIA });

    // Procurar por uma categoria literalmente chamada "Sem categoria"
    // devolveria zero linhas.
    expect(ultimaConsulta.category).toEqual({ $in: [null, ''] });
  });

  it('ignora busca vazia em vez de filtrar por string vazia', async () => {
    await service.listFaqs({ search: '   ' });

    // `?search=` casaria com tudo e mascararia o filtro de categoria.
    expect(ultimaConsulta.$or).toBeUndefined();
  });
});
