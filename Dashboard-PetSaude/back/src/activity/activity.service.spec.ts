import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ActivityService } from './activity.service';
import { Activity, RETENCAO_DIAS } from './schemas/activity.schema';

/**
 * O registro de auditoria.
 *
 * LÓGICA DO LUCIANO: os testes cobrem três coisas que falham em silêncio.
 *
 * O prazo de retenção, porque é o que sustenta a base legal de guardar dado de
 * acesso de pessoa identificada: sem `expires_at`, o índice TTL não apaga nada
 * e a coleção vira acervo permanente sem ninguém perceber.
 *
 * A gravação não lançar, porque auditoria que derruba a operação auditada é
 * pior que auditoria nenhuma: uma falha do Mongo impediria alguém de fazer
 * login.
 *
 * E o intervalo de datas, porque filtrar "de 10/03 até 10/03" precisa mostrar o
 * dia inteiro. Comparar com a meia-noite devolveria zero linhas e a pessoa
 * concluiria que não houve alteração nenhuma naquele dia.
 */
describe('ActivityService', () => {
  let service: ActivityService;
  let gravados: any[];
  let ultimoFiltro: any;
  let salvarFalha: boolean;

  beforeEach(async () => {
    gravados = [];
    ultimoFiltro = undefined;
    salvarFalha = false;

    const cadeia = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    const Model: any = jest.fn().mockImplementation(function (this: any, doc: any) {
      Object.assign(this, doc);
      this.save = jest.fn(async () => {
        if (salvarFalha) throw new Error('mongo fora do ar');
        gravados.push(doc);
        return this;
      });
    });
    Model.find = jest.fn((filtro: any) => {
      ultimoFiltro = filtro;
      return cadeia;
    });
    Model.countDocuments = jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) }));
    Model.aggregate = jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) }));

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [ActivityService, { provide: getModelToken(Activity.name), useValue: Model }],
    }).compile();

    service = modulo.get(ActivityService);
  });

  describe('prazo de retencao', () => {
    it('registro de acesso expira em 90 dias', async () => {
      await service.registrar({
        actor_name: 'Ana',
        action: 'login',
        entity_type: 'sessao',
      });

      const dias = Math.round(
        (gravados[0].expires_at.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      expect(dias).toBe(RETENCAO_DIAS.sessao);
      expect(dias).toBe(90);
    });

    it('alteracao de conteudo dura muito mais que registro de acesso', async () => {
      // Histórico editorial da base de FAQs não é rastreamento de pessoa, e não
      // deve ser descartado no mesmo prazo.
      await service.registrar({ actor_name: 'Ana', action: 'editar', entity_type: 'faq' });

      const dias = Math.round(
        (gravados[0].expires_at.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      expect(dias).toBe(RETENCAO_DIAS.faq);
      expect(dias).toBeGreaterThan(RETENCAO_DIAS.sessao);
    });

    it('todo registro nasce com data de expiracao', async () => {
      // Sem `expires_at` o indice TTL nao apaga o documento nunca, e o prazo de
      // retencao vira so uma frase na tela.
      for (const tipo of ['faq', 'usuario', 'sessao', 'regra_importacao', 'sistema'] as const) {
        await service.registrar({ actor_name: 'Ana', action: 'x', entity_type: tipo });
      }
      expect(gravados).toHaveLength(5);
      expect(gravados.every((g) => g.expires_at instanceof Date)).toBe(true);
    });
  });

  describe('gravacao', () => {
    it('nao lanca quando o banco falha', async () => {
      salvarFalha = true;

      await expect(
        service.registrar({ actor_name: 'Ana', action: 'login', entity_type: 'sessao' }),
      ).resolves.toBeUndefined();
    });

    it('grava sucesso por padrao, e negado quando dito', async () => {
      await service.registrar({ actor_name: 'Ana', action: 'login', entity_type: 'sessao' });
      await service.registrar({
        actor_name: 'x@y.com',
        action: 'login_recusado',
        entity_type: 'sessao',
        status: 'negado',
      });

      expect(gravados[0].status).toBe('sucesso');
      expect(gravados[1].status).toBe('negado');
    });

    it('guarda o antes e o depois quando vem', async () => {
      await service.registrar({
        actor_name: 'Ana',
        action: 'editar',
        entity_type: 'faq',
        entity_id: 'faq-1',
        before: { answer: '8 horas' },
        after: { answer: '12 horas' },
      });

      expect(gravados[0].before).toEqual({ answer: '8 horas' });
      expect(gravados[0].after).toEqual({ answer: '12 horas' });
      expect(gravados[0].entity_id).toBe('faq-1');
    });

    it('logActivity continua funcionando como atalho de FAQ', async () => {
      await service.logActivity('Ana', 'inserir', 'Preciso de jejum?', 'u1');

      expect(gravados[0]).toMatchObject({
        actor_name: 'Ana',
        actor_id: 'u1',
        action: 'inserir',
        entity_type: 'faq',
        target: 'Preciso de jejum?',
      });
    });
  });

  describe('filtros', () => {
    it('filtra por pessoa, tipo, acao e situacao', async () => {
      await service.getRecentActivities({
        actorId: 'u1',
        entityType: 'usuario',
        action: 'redefinir_senha',
        status: 'negado',
      });

      expect(ultimoFiltro).toEqual({
        actor_id: 'u1',
        entity_type: 'usuario',
        action: 'redefinir_senha',
        status: 'negado',
      });
    });

    it('sem filtro, nao restringe nada', async () => {
      await service.getRecentActivities({});

      expect(ultimoFiltro).toEqual({});
    });

    it('usa as pontas exatamente como recebidas, sem mexer no fuso', () => {
      // Antes o servico fazia `new Date('2026-03-10')` -- meia-noite UTC -- e
      // depois `setHours` LOCAL. Num servidor em UTC-3 o intervalo virava
      // 09/03 21:00 ate 09/03 23:59, e filtrar "de 10/03 ate 10/03" nao
      // devolvia nada do dia 10. Quem monta as pontas agora e o front, que sabe
      // o fuso de quem esta filtrando.
      const de = '2026-03-10T03:00:00.000Z';
      const ate = '2026-03-11T02:59:59.999Z';

      return service.getRecentActivities({ de, ate }).then(() => {
        expect(ultimoFiltro.created_at.$gte.toISOString()).toBe(de);
        expect(ultimoFiltro.created_at.$lte.toISOString()).toBe(ate);
      });
    });
  });
});
