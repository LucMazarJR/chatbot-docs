import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { TypedConfigService } from '@/config/typed-config.service';

const RATE_WINDOW_MS = 60_000;

/**
 * Fila de saída com política anti-ban.
 *
 * O WhatsApp não publica os critérios que levam ao banimento de um número, mas
 * responder instantaneamente e em rajada é o padrão mais óbvio de automação.
 * Três medidas, portanto:
 *
 * 1. **Serialização por sessão** — nunca dois envios simultâneos no mesmo número;
 * 2. **Atraso aleatório** entre envios, em vez de um intervalo fixo (que também
 *    é um padrão detectável);
 * 3. **Teto de mensagens por minuto** em janela deslizante.
 *
 * Isto é mitigação, não garantia: quem garante que o número não cai é a
 * WhatsApp Cloud API oficial — ver `docs/depende-de-voce.md`.
 *
 * Fila em memória é adequada à Fase 1 (uma réplica). Com mais de um processo
 * ela deixa de valer, e é aí que entra o BullMQ da Fase 2.
 */
@Injectable()
export class SendQueueService {
  /** Última promessa da cadeia de cada sessão — a serialização em si. */
  private readonly chains = new Map<string, Promise<unknown>>();

  /** Instantes dos envios recentes, para a janela deslizante. */
  private sentAt: number[] = [];

  private depth = 0;

  constructor(
    @InjectPinoLogger(SendQueueService.name) private readonly logger: PinoLogger,
    private readonly config: TypedConfigService,
  ) {}

  get queueDepth(): number {
    return this.depth;
  }

  /** Enfileira respeitando a ordem de chegada dentro da sessão. */
  async enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    this.depth += 1;

    // `catch` no elo anterior: um envio que falhou não pode travar a fila
    // inteira daquela sessão.
    const previous = this.chains.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.runThrottled(task));

    this.chains.set(
      sessionId,
      current.catch(() => undefined),
    );

    try {
      return await current;
    } finally {
      this.depth -= 1;
    }
  }

  private async runThrottled<T>(task: () => Promise<T>): Promise<T> {
    await this.waitForRateSlot();
    await delay(this.randomDelayMs());

    return task();
  }

  /** Segura a execução até caber no teto de mensagens por minuto. */
  private async waitForRateSlot(): Promise<void> {
    const limit = this.config.get('WA_MAX_MSG_PER_MINUTE');

    for (;;) {
      const now = Date.now();
      this.sentAt = this.sentAt.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);

      if (this.sentAt.length < limit) {
        this.sentAt.push(now);
        return;
      }

      const oldest = this.sentAt[0] ?? now;
      const waitMs = RATE_WINDOW_MS - (now - oldest) + 50;

      this.logger.warn({ limit, waitMs }, 'Teto de envios por minuto atingido; aguardando');
      await delay(waitMs);
    }
  }

  private randomDelayMs(): number {
    const min = this.config.get('WA_SEND_MIN_DELAY_MS');
    const max = Math.max(min, this.config.get('WA_SEND_MAX_DELAY_MS'));

    return min + Math.floor(Math.random() * (max - min + 1));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
