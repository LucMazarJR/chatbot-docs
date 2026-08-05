import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { WhatsAppModule } from '@/channels/whatsapp/whatsapp.module';
import { AppConfigModule } from '@/config/config.module';
import { HealthModule } from '@/health/health.module';
import { InboundModule } from '@/inbound/inbound.module';
import { OutboundModule } from '@/outbound/outbound.module';
import { SessionsModule } from '@/sessions/sessions.module';
import { ApiKeyGuard } from '@/shared/auth/api-key.guard';
import { CorrelationMiddleware } from '@/shared/correlation/correlation.middleware';
import { CorrelationModule } from '@/shared/correlation/correlation.module';
import { AllExceptionsFilter } from '@/shared/filters/all-exceptions.filter';
import { AppLoggerModule } from '@/shared/logger/logger.module';
import { RedisModule } from '@/shared/redis/redis.module';
import { WebhooksModule } from '@/webhooks/webhooks.module';

@Module({
  imports: [
    AppConfigModule,
    CorrelationModule,
    AppLoggerModule,
    RedisModule,
    WhatsAppModule,
    WebhooksModule,
    SessionsModule,
    InboundModule,
    OutboundModule,
    HealthModule,
  ],
  providers: [
    // Autenticação por padrão: uma rota nova nasce protegida, e abrir exige o
    // decorador `@Public()` explícito. O contrário — proteger caso a caso — é
    // como se esquece de proteger.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
