import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import pino from 'pino';

import { AppConfigModule } from '@/config/config.module';
import { TypedConfigService } from '@/config/typed-config.service';

import { REDIS_CLIENT } from './redis.tokens';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [TypedConfigService],
      useFactory: (config: TypedConfigService): Redis => {
        const client = new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD'),
          db: config.get('REDIS_DB'),
          // Falhar rápido em vez de enfileirar comandos indefinidamente com o
          // Redis fora do ar — quem chama decide o que fazer com o erro.
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false,
          retryStrategy: (times) => Math.min(times * 200, 5_000),
        });

        // Sem este listener o ioredis despeja "Unhandled error event" em texto
        // cru no stderr, fora do log estruturado — invisível para qualquer
        // coletor. O logger é criado aqui, e não injetado, porque o cliente
        // precisa do listener já no primeiro erro de conexão.
        const logger = pino({ level: config.get('LOG_LEVEL') }).child({
          service: 'whatsapp-gateway',
          context: 'RedisClient',
        });

        client.on('error', (error: Error) => {
          logger.warn({ err: error }, 'Erro de conexão com o Redis');
        });

        client.on('ready', () => {
          logger.info('Conexão com o Redis estabelecida');
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // `quit` espera os comandos em voo terminarem, ao contrário de `disconnect`.
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
