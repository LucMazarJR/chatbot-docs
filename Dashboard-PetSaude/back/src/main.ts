import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // LÓGICA DO LUCIANO: os DTOs existiam desde sempre mas nunca eram aplicados,
  // porque o pipe nunca foi registrado. Ligar isso exigiu antes alinhar os DTOs
  // ao que o front realmente envia.
  //
  // forbidNonWhitelisted fica FALSE de proposito: com true, um campo extra
  // inesperado vira 400 duro. Como front (Vercel) e back (Render) sobem em
  // momentos diferentes, e mais seguro descartar o campo em silencio do que
  // derrubar a requisicao durante uma janela de deploy.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
