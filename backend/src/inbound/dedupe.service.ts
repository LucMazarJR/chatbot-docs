import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { TypedConfigService } from '@/config/typed-config.service';
import { REDIS_CLIENT } from '@/shared/redis/redis.tokens';

/**
 * Deduplicação de mensagens recebidas.
 *
 * O WhatsApp reentrega mensagens quando a conexão oscila, e o Baileys reemite
 * eventos ao reconectar. Sem isto, uma queda de rede faz o cidadão receber a
 * mesma resposta duas ou três vezes — e cada repetição custa uma chamada ao
 * Gemini.
 */
@Injectable()
export class DedupeService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectPinoLogger(DedupeService.name) private readonly logger: PinoLogger,
    private readonly config: TypedConfigService,
  ) {}

  /**
   * Marca a mensagem como vista e devolve `true` se ela é inédita.
   *
   * `SET NX` é atômico, então dois workers processando o mesmo evento em
   * paralelo continuam produzindo uma única resposta.
   *
   * Em caso de falha do Redis, devolve `true` (deixa passar): responder duas
   * vezes é ruim, mas ficar mudo porque o Redis caiu é pior.
   */
  async isFirstOccurrence(sessionId: string, messageId: string): Promise<boolean> {
    const key = `wa:dedupe:${sessionId}:${messageId}`;

    try {
      const result = await this.redis.set(
        key,
        '1',
        'EX',
        this.config.get('DEDUPE_TTL_SECONDS'),
        'NX',
      );

      return result === 'OK';
    } catch (error) {
      this.logger.error({ err: error, messageId }, 'Redis indisponível; seguindo sem dedupe');

      return true;
    }
  }
}
