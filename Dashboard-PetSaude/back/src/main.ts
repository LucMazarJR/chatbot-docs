import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // LÓGICA DO LUCIANO: `enableCors()` sem argumento libera QUALQUER origem.
  // A API usa Bearer token, então o risco é menor que com cookie, mas não há
  // motivo para um site qualquer conseguir chamá-la do navegador de quem está
  // logado. A lista vem do ambiente; sem ela, só as origens locais.
  const origens = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({ origin: origens, credentials: true });

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
