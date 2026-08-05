import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { AppConfigModule } from '@/config/config.module';
import { TypedConfigService } from '@/config/typed-config.service';
import { CorrelationModule } from '@/shared/correlation/correlation.module';
import { CorrelationService } from '@/shared/correlation/correlation.service';

/**
 * Segredos que nunca podem chegar ao log.
 *
 * O corpo das mensagens também é sensível (é dado de saúde de um cidadão), mas
 * não é tratado aqui por redaction: o código simplesmente nunca loga o texto —
 * loga `textLength`. Redaction é a última linha de defesa, não a primeira.
 */
const REDACTED_PATHS = [
  'req.headers["x-api-key"]',
  'req.headers["x-webhook-token"]',
  'req.headers.authorization',
  'req.body.text',
];

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [AppConfigModule, CorrelationModule],
      inject: [TypedConfigService, CorrelationService],
      useFactory: (config: TypedConfigService, correlation: CorrelationService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
          // Produção: JSON de uma linha, pronto para coleta. Dev: legível.
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss' },
              },
          mixin: () => {
            const correlationId = correlation.current;
            return correlationId ? { correlationId } : {};
          },
          autoLogging: {
            ignore: (req) => req.url === '/health/live' || req.url === '/health/ready',
          },
          customProps: () => ({ service: 'whatsapp-gateway' }),
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
