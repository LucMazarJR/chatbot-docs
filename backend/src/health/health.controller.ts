import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';

import { WhatsAppProvider } from '@/channels/whatsapp/domain/whatsapp-provider.port';
import { TypedConfigService } from '@/config/typed-config.service';
import { Public } from '@/shared/auth/public.decorator';
import { REDIS_CLIENT } from '@/shared/redis/redis.tokens';

interface ReadinessReport {
  status: 'ok' | 'degraded';
  session: { id: string; status: string; phoneE164: string | null };
  redis: 'up' | 'down';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly provider: WhatsAppProvider,
    private readonly config: TypedConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Liveness: o processo está vivo?
   *
   * Não olha WhatsApp nem Redis de propósito — se olhasse, o Docker mataria o
   * container justamente quando ele está tentando reconectar, que é o pior
   * momento possível para reiniciar.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness — apenas confirma que o processo responde.' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: dá para atender de verdade?
   *
   * Responde 503 se a sessão não está conectada ou o Redis caiu — sinal para o
   * balanceador parar de mandar tráfego, sem reiniciar o processo.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — sessão conectada e Redis acessível.' })
  async ready(): Promise<ReadinessReport> {
    const sessionId = this.config.get('WA_SESSION_ID');
    const snapshot = this.provider.getSnapshot(sessionId);
    const redisUp = await this.pingRedis();

    const report: ReadinessReport = {
      status: snapshot.status === 'CONNECTED' && redisUp ? 'ok' : 'degraded',
      session: {
        id: sessionId,
        status: snapshot.status,
        phoneE164: snapshot.phoneE164,
      },
      redis: redisUp ? 'up' : 'down',
    };

    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }

  private async pingRedis(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
