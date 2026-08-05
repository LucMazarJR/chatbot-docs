import type { HttpService } from '@nestjs/axios';
import { AxiosError, type AxiosResponse } from 'axios';
import type { PinoLogger } from 'nestjs-pino';
import { of, throwError } from 'rxjs';

import type { TypedConfigService } from '@/config/typed-config.service';
import { CorrelationService } from '@/shared/correlation/correlation.service';
import { HmacService } from '@/shared/crypto/hmac.service';

import type { MessageReceivedEnvelope } from './contracts/webhook-envelope';
import { N8nDispatcherService } from './n8n-dispatcher.service';

const CONFIG: Record<string, unknown> = {
  N8N_WEBHOOK_URL: 'http://n8n:5678/webhook/whatsapp',
  N8N_WEBHOOK_TOKEN: 'token-de-teste-com-16+',
  N8N_WEBHOOK_SECRET: 'segredo-de-teste-16+',
  N8N_WEBHOOK_TIMEOUT_MS: 10_000,
  N8N_WEBHOOK_MAX_RETRIES: 2,
};

const ENVELOPE: MessageReceivedEnvelope = {
  eventId: 'EVT-1',
  type: 'message.received',
  occurredAt: '2026-08-04T13:22:31.412Z',
  sessionId: 'default',
  message: {
    id: 'MSG-1',
    chatId: '5516999998888@s.whatsapp.net',
    from: { phoneE164: '+5516999998888', pushName: 'Maria' },
    type: 'text',
    text: 'quais exames precisam de jejum?',
    quotedMessageId: null,
    isGroup: false,
    timestamp: '2026-08-04T13:22:30.000Z',
  },
};

function buildService(post: jest.Mock, maxRetries = 2) {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;

  const config = {
    get: (key: string) => (key === 'N8N_WEBHOOK_MAX_RETRIES' ? maxRetries : CONFIG[key]),
  } as unknown as TypedConfigService;

  const service = new N8nDispatcherService(
    logger,
    { post } as unknown as HttpService,
    config,
    new HmacService(),
    new CorrelationService(),
  );

  return { service, logger };
}

function httpError(status: number): AxiosError {
  return new AxiosError('falhou', 'ERR', undefined, undefined, {
    status,
  } as AxiosResponse);
}

describe('N8nDispatcherService', () => {
  it('entrega o envelope e assina o corpo', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 200 }));
    const { service } = buildService(post);

    await expect(service.dispatch(ENVELOPE)).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(1);

    const [url, body, options] = post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];

    expect(url).toBe(CONFIG.N8N_WEBHOOK_URL);
    expect(JSON.parse(body)).toEqual(ENVELOPE);
    expect(options.headers['X-Webhook-Token']).toBe(CONFIG.N8N_WEBHOOK_TOKEN);

    // A assinatura precisa bater com o corpo exato que foi transmitido.
    const signature = options.headers['X-Signature-256'];
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(new HmacService().verify(body, CONFIG.N8N_WEBHOOK_SECRET as string, signature!)).toBe(
      true,
    );
  });

  it('repete quando o n8n devolve 500 e desiste depois do limite', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => httpError(500)));
    const { service } = buildService(post, 1);

    await expect(service.dispatch(ENVELOPE)).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(2); // tentativa inicial + 1 retry
  });

  it('repete e tem sucesso na segunda tentativa', async () => {
    const post = jest
      .fn()
      .mockReturnValueOnce(throwError(() => httpError(503)))
      .mockReturnValueOnce(of({ status: 200 }));
    const { service } = buildService(post, 1);

    await expect(service.dispatch(ENVELOPE)).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('não repete em 401 — credencial errada não melhora com insistência', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => httpError(401)));
    const { service } = buildService(post);

    await expect(service.dispatch(ENVELOPE)).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('repete em 429, que é condição temporária', async () => {
    const post = jest
      .fn()
      .mockReturnValueOnce(throwError(() => httpError(429)))
      .mockReturnValueOnce(of({ status: 200 }));
    const { service } = buildService(post, 1);

    await expect(service.dispatch(ENVELOPE)).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('nunca lança — o WhatsApp não pode cair porque o n8n caiu', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
    const { service } = buildService(post, 0);

    await expect(service.dispatch(ENVELOPE)).resolves.toBe(false);
  });
});
