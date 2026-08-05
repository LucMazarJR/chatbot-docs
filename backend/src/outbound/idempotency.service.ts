import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { REDIS_CLIENT } from '@/shared/redis/redis.tokens';

const TTL_SECONDS = 86_400;

/**
 * Idempotência do envio.
 *
 * O nó HTTP do n8n repete a requisição em caso de timeout. Sem isto, um
 * timeout do gateway (que ainda assim entregou a mensagem) faria o cidadão
 * receber a mesma resposta duas vezes.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectPinoLogger(IdempotencyService.name) private readonly logger: PinoLogger,
  ) {}

  /** Id da mensagem já enviada com esta chave, se houver. */
  async findExisting(key: string): Promise<string | null> {
    try {
      return await this.redis.get(this.redisKey(key));
    } catch (error) {
      this.logger.error({ err: error }, 'Redis indisponível; seguindo sem idempotência');

      return null;
    }
  }

  async remember(key: string, messageId: string): Promise<void> {
    try {
      await this.redis.set(this.redisKey(key), messageId, 'EX', TTL_SECONDS);
    } catch (error) {
      this.logger.error({ err: error }, 'Falha ao registrar chave de idempotência');
    }
  }

  private redisKey(key: string): string {
    return `wa:idem:${key}`;
  }
}
