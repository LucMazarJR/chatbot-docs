import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { TypedConfigService } from './config/typed-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(TypedConfigService);

  // Health fica fora do prefixo: sondas de Docker/Kubernetes não devem
  // depender da versão da API.
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Fecha sockets do WhatsApp e a conexão do Redis antes de o processo morrer.
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('WhatsApp Gateway')
    .setDescription(
      'Backend de WhatsApp do chatbot de saúde. Substitui o WAHA e entrega os eventos ao n8n.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'apiKey')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(config.get('PORT'), '0.0.0.0');
}

void bootstrap();
