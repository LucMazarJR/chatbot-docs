import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';

import type { TypedConfigService } from '@/config/typed-config.service';

import { DedupeService } from './dedupe.service';

function buildService(redis: Partial<Redis>) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
  const config = { get: () => 86_400 } as unknown as TypedConfigService;

  return new DedupeService(redis as Redis, logger, config);
}

describe('DedupeService', () => {
  it('aceita a primeira ocorrência da mensagem', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const service = buildService({ set });

    await expect(service.isFirstOccurrence('default', 'MSG-1')).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith('wa:dedupe:default:MSG-1', '1', 'EX', 86_400, 'NX');
  });

  it('rejeita a reentrega da mesma mensagem', async () => {
    // O WhatsApp reentrega quando a conexão oscila; sem isto o cidadão recebe
    // a mesma resposta duas vezes e o Gemini é cobrado duas vezes.
    const service = buildService({ set: jest.fn().mockResolvedValue(null) });

    await expect(service.isFirstOccurrence('default', 'MSG-1')).resolves.toBe(false);
  });

  it('isola sessões diferentes', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const service = buildService({ set });

    await service.isFirstOccurrence('secretaria-a', 'MSG-1');
    await service.isFirstOccurrence('secretaria-b', 'MSG-1');

    expect(set).toHaveBeenNthCalledWith(1, 'wa:dedupe:secretaria-a:MSG-1', '1', 'EX', 86_400, 'NX');
    expect(set).toHaveBeenNthCalledWith(2, 'wa:dedupe:secretaria-b:MSG-1', '1', 'EX', 86_400, 'NX');
  });

  it('deixa a mensagem passar se o Redis estiver fora do ar', async () => {
    // Escolha explícita: responder duas vezes é ruim, ficar mudo é pior.
    const service = buildService({ set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });

    await expect(service.isFirstOccurrence('default', 'MSG-1')).resolves.toBe(true);
  });
});
