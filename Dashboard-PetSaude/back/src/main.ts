import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeçalhos de segurança padrão (X-Content-Type-Options, X-Frame-Options,
  // etc). contentSecurityPolicy desligado: esta API não serve HTML, e a CSP
  // do helmet é pensada para páginas, não para um backend puramente JSON —
  // ligada, ela não protege nada aqui e só atrapalha o Swagger em /api/docs.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Comprime as respostas. GET /faqs manda até 100 documentos por página;
  // sem isso cada página paga o tamanho do JSON cru na rede toda vez.
  app.use(compression());

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

  // Fecha as conexões do Mongo e do Postgres de forma limpa ao receber
  // SIGTERM. O Render manda SIGTERM a cada deploy e a cada vez que o serviço
  // hiberna — sem isto, o processo é morto com conexões abertas, que só se
  // resolvem sozinhas quando o banco expira o timeout por inatividade.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
