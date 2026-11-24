import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from '../activity/activity.service';
import { GeminiService } from '../gemini/gemini.service';
import { Faq } from './schemas/faq.schema';
import { FaqsService, type AcessoRevisao } from './faqs.service';

/**
 * Revisão por data: quem pode editar o quê, e o que a data aceita.
 *
 * A regra que importa é a do acesso: a área Revisões abre a edição do texto
 * sem a área FAQs, e um erro aqui daria a um revisor a base inteira.
 */
describe('FaqsService: revisão por data', () => {
  let service: FaqsService;
  let doc: any;
  let ultimoFiltro: any;
  let registrar: jest.Mock;

  const pessoa = (id: string, permissoes: AcessoRevisao['permissoes'], master = false): AcessoRevisao => ({
    id,
    name: `Pessoa ${id}`,
    master,
    permissoes,
  });
  const EDITOR = pessoa('editor', { faqs: 'editar' });
  const REVISOR_DE_TODAS = pessoa('revisor', { faqs: 'ver', revisoes: 'editar' });
  const REVISOR_DAS_SUAS = pessoa('autora', { faqs: 'ver', revisoes: 'ver' });
  const LEITOR = pessoa('leitor', { faqs: 'ver' });

  // Bem à frente, para o teste não envelhecer.
  const FUTURO = '2099-01-10';

  const novaFaq = (extra: Record<string, unknown> = {}) => ({
    _id: { toString: () => 'faq-1' },
    question: 'Tem vacina de Hepatite A no posto?',
    answer: 'Sim, durante o surto, em todas as UBS.',
    category: 'Vacinas',
    tags: ['vacina', 'hepatite', 'surto'],
    source: '',
    created_by: 'Pessoa autora',
    created_by_id: 'autora',
    revisar_em: new Date('2026-11-01T03:00:00Z'),
    revisao_nota: 'Surto de Hepatite A',
    save: jest.fn(async () => undefined),
    toObject() {
      return { ...this };
    },
    ...extra,
  });

  beforeEach(async () => {
    doc = novaFaq();
    ultimoFiltro = undefined;
    registrar = jest.fn();

    const cadeia = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const model = {
      findById: jest.fn(() => ({ exec: jest.fn(async () => doc) })),
      find: jest.fn((filtro: any) => {
        ultimoFiltro = filtro;
        return cadeia;
      }),
      countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        FaqsService,
        { provide: getModelToken(Faq.name), useValue: model },
        { provide: ActivityService, useValue: { registrar } },
        { provide: GeminiService, useValue: { gerarEmbedding: jest.fn() } },
      ],
    }).compile();
    service = modulo.get(FaqsService);
  });

  describe('quem edita', () => {
    it('revisor de todas edita o texto de FAQ em revisão de outra pessoa', async () => {
      await service.revisar('507f1f77bcf86cd799439011', { revisar_em: FUTURO }, REVISOR_DE_TODAS);
      expect(doc.save).toHaveBeenCalled();
    });

    it('revisor das suas não mexe na FAQ de outra pessoa', async () => {
      doc = novaFaq({ created_by_id: 'outra', created_by: 'Outra' });
      await expect(
        service.revisar('507f1f77bcf86cd799439011', { revisar_em: FUTURO }, REVISOR_DAS_SUAS),
      ).rejects.toThrow(/só as suas/);
    });

    it('revisor das suas mexe na que criou, inclusive nas antigas, só com o nome', async () => {
      doc = novaFaq({ created_by_id: undefined, created_by: 'Pessoa autora' });
      await service.revisar('507f1f77bcf86cd799439011', { revisar_em: FUTURO }, REVISOR_DAS_SUAS);
      expect(doc.save).toHaveBeenCalled();
    });

    it('Revisões não abre FAQ sem data de revisão: isso seria a base inteira', async () => {
      doc = novaFaq({ revisar_em: null });
      await expect(
        service.revisar('507f1f77bcf86cd799439011', { revisar_em: FUTURO }, REVISOR_DE_TODAS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('quem só lê FAQs não revisa nada', async () => {
      await expect(
        service.revisar('507f1f77bcf86cd799439011', { revisar_em: FUTURO }, LEITOR),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('quem edita FAQs revisa qualquer uma, como sempre', async () => {
      doc = novaFaq({ created_by_id: 'outra' });
      await service.revisar('507f1f77bcf86cd799439011', { revisar_em: null }, EDITOR);
      expect(doc.revisar_em).toBeNull();
    });
  });

  describe('continua valendo', () => {
    it('marca a próxima data, quem revisou e registra no histórico', async () => {
      await service.revisar(
        '507f1f77bcf86cd799439011',
        { revisar_em: FUTURO },
        REVISOR_DE_TODAS,
      );

      expect(doc.revisar_em.toISOString()).toBe('2099-01-10T03:00:00.000Z');
      expect(doc.revisada_por).toBe('Pessoa revisor');
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'revisar',
          before: expect.objectContaining({ revisar_em: '2026-11-01' }),
          after: expect.objectContaining({ revisar_em: '2099-01-10' }),
        }),
      );
    });

    it('tirar a revisão apaga o motivo junto', async () => {
      await service.revisar('507f1f77bcf86cd799439011', { revisar_em: null }, REVISOR_DE_TODAS);
      expect(doc.revisar_em).toBeNull();
      expect(doc.revisao_nota).toBeNull();
    });

    it('recusa repetir uma data que já passou', async () => {
      await expect(
        service.revisar('507f1f77bcf86cd799439011', { revisar_em: '2026-11-01' }, REVISOR_DE_TODAS),
      ).rejects.toThrow(/já passou/);
    });

    it('pede a data quando ela não vem', async () => {
      await expect(
        service.revisar('507f1f77bcf86cd799439011', {}, REVISOR_DE_TODAS),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('editar pelo formulário', () => {
    it('aceita reenviar a data vencida que já estava lá', async () => {
      await service.updateFaq(
        'faq-1',
        { revisar_em: '2026-11-01T03:00:00.000Z', revisao_nota: 'Surto de Hepatite A em Franca' },
        { id: 'revisor', name: 'Pessoa revisor' },
        REVISOR_DE_TODAS,
      );
      expect(doc.save).toHaveBeenCalled();
      // A data não mudou: ninguém marcou a próxima, então não conta como revisada.
      expect(doc.revisada_em).toBeUndefined();
    });

    it('mudar a data de uma FAQ em revisão conta como revisada', async () => {
      await service.updateFaq(
        'faq-1',
        { revisar_em: FUTURO },
        { id: 'revisor', name: 'Pessoa revisor' },
        REVISOR_DE_TODAS,
      );
      expect(doc.revisada_por).toBe('Pessoa revisor');
    });

    it('revisor não edita FAQ sem data, nem pelo formulário', async () => {
      doc = novaFaq({ revisar_em: null });
      await expect(
        service.updateFaq('faq-1', { answer: 'Outro texto qualquer.' }, { id: 'revisor', name: 'R' }, REVISOR_DE_TODAS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('lista de revisões', () => {
    it('revisor das suas recebe só as que criou, mesmo pedindo todas', async () => {
      const r = await service.listarRevisoes({ escopo: 'todas' }, REVISOR_DAS_SUAS);
      expect(r.escopo).toBe('minhas');
      expect(r.podeVerTodas).toBe(false);
      expect(ultimoFiltro.$or).toEqual([
        { created_by_id: 'autora' },
        { created_by_id: { $exists: false }, created_by: 'Pessoa autora' },
      ]);
    });

    it('revisor de todas vê todas por padrão, sem filtro de autor', async () => {
      const r = await service.listarRevisoes({}, REVISOR_DE_TODAS);
      expect(r.escopo).toBe('todas');
      expect(ultimoFiltro.$or).toBeUndefined();
      expect(ultimoFiltro.revisar_em.$lte).toBeInstanceOf(Date);
    });
  });
});
