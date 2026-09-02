import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // Tipado como NestExpressApplication por causa do `app.set` logo abaixo: o
  // INestApplication generico nao expoe as configuracoes do Express.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // LÓGICA DO LUCIANO: sem isto, `req.ip` é o IP do proxy do Render, não o de
  // quem chamou. Duas consequências, as duas invisíveis:
  //
  // 1. `user_sessions.ip` grava o endereço do proxy em toda sessão — a coluna
  //    de auditoria existe e está registrando o valor errado desde sempre.
  // 2. O ThrottlerGuard chaveia pelo mesmo IP, então as 10 tentativas de login
  //    por minuto viram UM balde compartilhado pelo mundo inteiro: dez erros de
  //    qualquer pessoa travam o login de todos, e um ataque distribuído não é
  //    freado por nada.
  //
  // `1` e não `true`: confia num único salto de proxy, o do provedor. `true`
  // confiaria na cadeia inteira de X-Forwarded-For, que o cliente pode forjar.
  app.set('trust proxy', 1);

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
