import type { Server } from 'node:http';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import type { SessionSnapshot } from '@/channels/whatsapp/domain/session.types';
import { WhatsAppProvider } from '@/channels/whatsapp/domain/whatsapp-provider.port';
import { SessionNotConnectedError } from '@/channels/whatsapp/domain/whatsapp.errors';
import { REDIS_CLIENT } from '@/shared/redis/redis.tokens';

const API_KEY = 'chave-de-teste-com-mais-de-16';

const CONNECTED: SessionSnapshot = {
  sessionId: 'default',
  status: 'CONNECTED',
  phoneE164: '+5516999990000',
  connectedAt: '2026-08-04T13:00:00.000Z',
  reconnectAttempts: 0,
  lastError: null,
};

describe('WhatsApp Gateway (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  /** Mock da porta: expõe os helpers do Jest sem brigar com a assinatura real. */
  let provider: Record<keyof WhatsAppProvider, jest.Mock>;

  beforeAll(async () => {
    provider = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      getSnapshot: jest.fn().mockReturnValue(CONNECTED),
      getQrCode: jest.fn().mockReturnValue(null),
      sendText: jest.fn().mockResolvedValue('MSG-ENVIADA-1'),
      isRegistered: jest.fn().mockResolvedValue(true),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      markAsRead: jest.fn().mockResolvedValue(undefined),
      onEvent: jest.fn(),
    };

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WhatsAppProvider)
      .useValue(provider)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis)
      .compile();

    app = moduleRef.createNestApplication();

    // Mesma configuração de `main.ts` — um e2e que não reproduz o bootstrap
    // real testa uma aplicação que não existe.
    app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /health/live responde sem autenticação', async () => {
      await request(server).get('/health/live').expect(200, { status: 'ok' });
    });

    it('GET /health/ready reporta sessão e Redis', async () => {
      const response = await request(server).get('/health/ready').expect(200);

      expect(response.body).toMatchObject({ status: 'ok', redis: 'up' });
    });
  });

  describe('autenticação', () => {
    it('rejeita requisição sem X-Api-Key', async () => {
      await request(server)
        .post('/api/v1/messages')
        .send({ to: '5516999998888', text: 'oi' })
        .expect(401);
    });

    it('rejeita X-Api-Key inválida', async () => {
      await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', 'chave-errada-mas-do-mesmo-tam')
        .send({ to: '5516999998888', text: 'oi' })
        .expect(401);
    });
  });

  describe('POST /api/v1/messages', () => {
    it('envia texto e devolve o id da mensagem', async () => {
      const response = await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', API_KEY)
        .send({ to: '5516999998888@s.whatsapp.net', text: 'Olá!' })
        .expect(202);

      expect(response.body).toEqual({
        id: 'MSG-ENVIADA-1',
        status: 'sent',
        sessionId: 'default',
        to: '5516999998888@s.whatsapp.net',
      });

      expect(provider.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ to: '5516999998888@s.whatsapp.net', text: 'Olá!' }),
      );
    });

    it('aceita número solto e converte para JID', async () => {
      await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', API_KEY)
        .send({ to: '+55 (16) 99999-8888', text: 'oi' })
        .expect(202);

      expect(provider.sendText).toHaveBeenLastCalledWith(
        expect.objectContaining({ to: '5516999998888@s.whatsapp.net' }),
      );
    });

    it('converte HTML residual para a sintaxe do WhatsApp', async () => {
      await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', API_KEY)
        .send({ to: '5516999998888', text: '<b>Jejum:</b> 8 horas' })
        .expect(202);

      expect(provider.sendText).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: '*Jejum:* 8 horas' }),
      );
    });

    it('rejeita corpo sem texto', async () => {
      await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', API_KEY)
        .send({ to: '5516999998888' })
        .expect(400);
    });

    it('rejeita campos desconhecidos', async () => {
      await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', API_KEY)
        .send({ to: '5516999998888', text: 'oi', campoInvalido: 1 })
        .expect(400);
    });

    it('devolve 503 quando a sessão não está conectada', async () => {
      provider.sendText.mockRejectedValueOnce(
        new SessionNotConnectedError('default', 'DISCONNECTED'),
      );

      await request(server)
        .post('/api/v1/messages')
        .set('X-Api-Key', API_KEY)
        .send({ to: '5516999998888', text: 'oi' })
        .expect(503);
    });
  });

  describe('sessions', () => {
    it('GET /api/v1/sessions/:id devolve o estado', async () => {
      const response = await request(server)
        .get('/api/v1/sessions/default')
        .set('X-Api-Key', API_KEY)
        .expect(200);

      expect(response.body).toEqual(CONNECTED);
    });

    it('GET /api/v1/sessions/:id/qr devolve 404 quando não há QR pendente', async () => {
      // Sessão conectada não tem QR — 404 é a resposta correta, não erro 500.
      await request(server)
        .get('/api/v1/sessions/default/qr')
        .set('X-Api-Key', API_KEY)
        .expect(404);
    });

    it('POST /api/v1/sessions/:id/start conecta a sessão', async () => {
      await request(server)
        .post('/api/v1/sessions/default/start')
        .set('X-Api-Key', API_KEY)
        .expect(200);

      expect(provider.connect).toHaveBeenCalledWith('default');
    });
  });
});
