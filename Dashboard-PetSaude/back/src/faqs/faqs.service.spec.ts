import { BadRequestException } from '@nestjs/common';
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

/**
 * Guarda de conteúdo: pergunta e resposta iguais não são um FAQ.
 *
 * LÓGICA DO LUCIANO: não havia NENHUMA validação de conteúdo antes desta
 * guarda — foi assim que uma FAQ com pergunta, resposta e categoria
 * literalmente "teste" foi criada pelo dashboard, indexada, e citada como
 * trecho numa conversa real com um cidadão.
 */
describe('FaqsService — validação de conteúdo', () => {
  let service: FaqsService;
  let gerarEmbedding: jest.Mock;
  let FakeFaqModel: any;

  beforeEach(async () => {
    gerarEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    // `new this.faqModel(...)` em createFaq exige um construtor, não um objeto
    // plano — por isso este mock é uma função, diferente do usado na
    // descrição acima (que só precisa de `find`/`countDocuments`).
    FakeFaqModel = jest.fn().mockImplementation(function (this: any, doc: any) {
      Object.assign(this, doc);
      this._id = { toString: () => 'faq-nova' };
      this.save = jest.fn().mockResolvedValue(this);
    });
    FakeFaqModel.findById = jest.fn();

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        FaqsService,
        { provide: getModelToken(Faq.name), useValue: FakeFaqModel },
        { provide: ActivityService, useValue: { logActivity: jest.fn() } },
        { provide: GeminiService, useValue: { gerarEmbedding } },
      ],
    }).compile();

    service = modulo.get(FaqsService);
  });

  it('createFaq rejeita quando pergunta e resposta sao iguais', async () => {
    await expect(
      service.createFaq({ question: 'teste', answer: 'teste' }, { name: 'Alguem' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createFaq rejeita ignorando espacos e maiusculas/minusculas', async () => {
    await expect(
      service.createFaq({ question: '  Teste  ', answer: 'teste' }, { name: 'Alguem' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createFaq nao gasta embedding quando o conteudo e rejeitado', async () => {
    await service
      .createFaq({ question: 'teste', answer: 'teste' }, { name: 'Alguem' })
      .catch(() => {});

    // A guarda fica ANTES da chamada ao Gemini nos dois metodos, de proposito.
    expect(gerarEmbedding).not.toHaveBeenCalled();
  });

  it('createFaq aceita pergunta e resposta diferentes normalmente', async () => {
    const resultado = await service.createFaq(
      { question: 'Qual o horario da UBS?', answer: 'Das 7h as 19h.' },
      { name: 'Alguem' },
    );

    expect(resultado.ok).toBe(true);
    expect(gerarEmbedding).toHaveBeenCalledTimes(1);
  });

  it('updateFaq rejeita quando a edicao deixaria pergunta e resposta iguais', async () => {
    FakeFaqModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        question: 'Qual o horario da UBS?',
        answer: 'Das 7h as 19h.',
        category: 'unidades',
        tags: [],
        source: '',
        content_hash: 'hash-antigo',
        embedding: [],
        save: jest.fn(),
      }),
    });

    await expect(
      service.updateFaq('id-existente', { answer: 'Qual o horario da UBS?' }, { name: 'Alguem' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * O texto que vira vetor.
 *
 * LÓGICA DO LUCIANO: este é o defeito que não dá erro em lugar nenhum. O campo
 * `text` alimenta o pageContent do nó Vector Store do n8n; o embedding define o
 * ranqueamento. Se os dois forem montados a partir de strings diferentes, o bot
 * recupera um trecho e pontua por outro — e ninguém percebe até uma pergunta
 * simplesmente parar de ser encontrada. Por isso o teste compara os dois em vez
 * de conferir o formato de um deles.
 */
describe('FaqsService — o texto embedado e o campo text', () => {
  let service: FaqsService;
  let gerarEmbedding: jest.Mock;
  let salvo: any;

  beforeEach(async () => {
    gerarEmbedding = jest.fn().mockResolvedValue(new Array(3072).fill(0.1));
    salvo = undefined;

    const FakeFaqModel: any = jest.fn().mockImplementation(function (this: any, doc: any) {
      Object.assign(this, doc);
      salvo = doc;
      this._id = { toString: () => 'faq-nova' };
      this.save = jest.fn().mockResolvedValue(this);
    });
    FakeFaqModel.findById = jest.fn();

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        FaqsService,
        { provide: getModelToken(Faq.name), useValue: FakeFaqModel },
        { provide: ActivityService, useValue: { logActivity: jest.fn() } },
        {
          provide: GeminiService,
          useValue: { gerarEmbedding, modeloAtual: 'gemini-embedding-2', dimensoes: 3072 },
        },
      ],
    }).compile();

    service = modulo.get(FaqsService);
  });

  it('embeda exatamente a mesma string que grava em text', async () => {
    await service.createFaq(
      {
        question: 'Preciso de jejum?',
        answer: 'Sim, 8 horas.',
        categories: ['exames'],
      },
      { name: 'Alguem' },
    );

    expect(gerarEmbedding).toHaveBeenCalledWith(salvo.text);
  });

  it('inclui o assunto no texto embedado', async () => {
    // Sem o assunto, perguntas identicas entre exames ("Como me preparar para o
    // Exame?") viram vetores iguais e o ranqueamento vira sorteio.
    await service.createFaq(
      { question: 'Como me preparar?', answer: 'Jejum de 8 horas.', categories: ['zinco'] },
      { name: 'Alguem' },
    );

    expect(gerarEmbedding).toHaveBeenCalledWith(
      'Assunto: zinco\nPergunta: Como me preparar?\nResposta: Jejum de 8 horas.',
    );
  });

  it('grava a procedencia do vetor junto com ele', async () => {
    // Sem embedding_model gravado nao ha como saber depois em que modelo a base
    // esta — e a dimensao nao responde, porque o 001 tambem produz 3072.
    await service.createFaq(
      { question: 'Qual o horario da UBS?', answer: 'Das 7h as 19h.', categories: ['unidades'] },
      { name: 'Alguem' },
    );

    expect(salvo.embedding_model).toBe('gemini-embedding-2');
    expect(salvo.embedding_dim).toBe(3072);
    expect(salvo.embedding_content_hash).toBe(salvo.content_hash);
  });

  it('grava a FAQ mesmo quando o embedding falha, e avisa quem chamou', async () => {
    gerarEmbedding.mockRejectedValue(new Error('429 Too Many Requests: quota exceeded'));

    const resultado = await service.createFaq(
      { question: 'Qual o horario da UBS?', answer: 'Das 7h as 19h.', categories: ['unidades'] },
      { name: 'Alguem' },
    );

    // Perder o conteudo digitado seria pior. Mas quem chamou precisa saber, para
    // a importacao em lote parar em vez de gravar centenas de FAQs invisiveis.
    expect(resultado.ok).toBe(true);
    expect(resultado.semEmbedding).toBe(true);
    expect(resultado.falha).toBe('cota');
    expect(salvo.embedding).toEqual([]);
    expect(salvo.embedding_content_hash).toBeUndefined();
  });

  it('distingue falha de cota de falha passageira', async () => {
    gerarEmbedding.mockRejectedValue(new Error('socket hang up'));

    const resultado = await service.createFaq(
      { question: 'Qual o horario da UBS?', answer: 'Das 7h as 19h.', categories: ['unidades'] },
      { name: 'Alguem' },
    );

    expect(resultado.falha).toBe('outra');
  });

  it('marca a origem quando a FAQ vem de uma importacao', async () => {
    await service.createFaq(
      { question: 'Qual o horario da UBS?', answer: 'Das 7h as 19h.', categories: ['unidades'] },
      { name: 'Alguem' },
      {
        file_id: 'dashboard_import',
        file_origin: 'faqs-agosto.xlsx',
        line_reference: 12,
        import_script_id: 'script-1',
        import_script_version: 3,
      },
    );

    expect(salvo.file_id).toBe('dashboard_import');
    expect(salvo.file_origin).toBe('faqs-agosto.xlsx');
    expect(salvo.line_reference).toBe(12);
    expect(salvo.import_script_version).toBe(3);
  });

  it('sem origem, continua marcando como insercao manual', async () => {
    await service.createFaq(
      { question: 'Qual o horario da UBS?', answer: 'Das 7h as 19h.', categories: ['unidades'] },
      { name: 'Alguem' },
    );

    expect(salvo.file_id).toBe('dashboard_manual');
  });
});
