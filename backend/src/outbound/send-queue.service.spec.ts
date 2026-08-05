import type { PinoLogger } from 'nestjs-pino';

import type { TypedConfigService } from '@/config/typed-config.service';

import { SendQueueService } from './send-queue.service';

/** Atrasos zerados: aqui se testa ordem e serialização, não a espera em si. */
const FAST_CONFIG: Record<string, number> = {
  WA_SEND_MIN_DELAY_MS: 0,
  WA_SEND_MAX_DELAY_MS: 0,
  WA_MAX_MSG_PER_MINUTE: 100,
};

function buildQueue(overrides: Record<string, number> = {}) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
  const values = { ...FAST_CONFIG, ...overrides };
  const config = { get: (key: string) => values[key] } as unknown as TypedConfigService;

  return new SendQueueService(logger, config);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SendQueueService', () => {
  it('preserva a ordem de chegada dentro da sessão', async () => {
    const queue = buildQueue();
    const order: number[] = [];

    await Promise.all([
      // A primeira tarefa é a mais lenta: sem serialização, ela terminaria por último.
      queue.enqueue('default', async () => {
        await delay(30);
        order.push(1);
      }),
      queue.enqueue('default', async () => {
        order.push(2);
        return Promise.resolve();
      }),
      queue.enqueue('default', async () => {
        order.push(3);
        return Promise.resolve();
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('nunca executa dois envios ao mesmo tempo na mesma sessão', async () => {
    const queue = buildQueue();
    let running = 0;
    let maxConcurrent = 0;

    await Promise.all(
      Array.from({ length: 5 }, () =>
        queue.enqueue('default', async () => {
          running += 1;
          maxConcurrent = Math.max(maxConcurrent, running);
          await delay(5);
          running -= 1;
        }),
      ),
    );

    expect(maxConcurrent).toBe(1);
  });

  it('propaga o erro ao chamador sem travar a fila', async () => {
    const queue = buildQueue();

    const falha = queue.enqueue('default', () => Promise.reject(new Error('sessão caiu')));
    await expect(falha).rejects.toThrow('sessão caiu');

    // O elo seguinte precisa continuar rodando normalmente.
    await expect(queue.enqueue('default', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('devolve o valor da tarefa', async () => {
    const queue = buildQueue();

    await expect(queue.enqueue('default', () => Promise.resolve('MSG-1'))).resolves.toBe('MSG-1');
  });

  it('zera a profundidade da fila ao terminar, inclusive com erro', async () => {
    const queue = buildQueue();

    await queue.enqueue('default', () => Promise.resolve(null));
    await queue.enqueue('default', () => Promise.reject(new Error('x'))).catch(() => undefined);

    expect(queue.queueDepth).toBe(0);
  });

  it('respeita o atraso mínimo configurado entre envios', async () => {
    const queue = buildQueue({ WA_SEND_MIN_DELAY_MS: 40, WA_SEND_MAX_DELAY_MS: 40 });
    const started = Date.now();

    await queue.enqueue('default', () => Promise.resolve(null));
    await queue.enqueue('default', () => Promise.resolve(null));

    // Dois envios, dois atrasos de 40ms. Margem para a imprecisão do timer.
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });

  it('sessões distintas não bloqueiam uma à outra', async () => {
    const queue = buildQueue();
    const order: string[] = [];

    await Promise.all([
      queue.enqueue('sessao-a', async () => {
        await delay(30);
        order.push('a');
      }),
      queue.enqueue('sessao-b', async () => {
        order.push('b');
        return Promise.resolve();
      }),
    ]);

    expect(order).toEqual(['b', 'a']);
  });
});
