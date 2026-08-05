# whatsapp-gateway

Backend NestJS que faz a ponte entre o WhatsApp e o n8n. Substitui o WAHA.

## Por que existe

O WAHA era uma caixa-preta: não dava para deduplicar mensagens, controlar o ritmo de envio, fazer retry, auditar nada — e o fluxo do n8n precisava cavar dentro de `payload._data.key.remoteJidAlt`, um campo interno do motor Baileys, para descobrir quem havia falado. Trocar o motor quebrava o bot.

## Arquitetura

Hexagonal (ports & adapters). Toda a aplicação depende da porta `WhatsAppProvider`; nada importa o adapter diretamente.

```
src/
├─ channels/whatsapp/
│  ├─ domain/                    ← a fronteira
│  │  ├─ whatsapp-provider.port.ts      porta do canal
│  │  ├─ auth-state.repository.port.ts  porta de persistência da sessão
│  │  ├─ message.types.ts               InboundMessage, OutboundTextMessage
│  │  └─ whatsapp.errors.ts
│  ├─ adapters/baileys/          ← único lugar que conhece o Baileys
│  │  ├─ baileys.provider.ts            socket, reconexão, QR
│  │  ├─ baileys-event.mapper.ts        payload cru → domínio (função pura)
│  │  └─ file-auth-state.repository.ts  credenciais em volume
│  └─ whatsapp.module.ts         ← onde se escolhe a implementação
├─ sessions/     ciclo de vida, QR, status
├─ inbound/      normalização + deduplicação
├─ outbound/     envio, fila anti-ban, formatação, idempotência
├─ webhooks/     entrega assinada ao n8n
├─ health/       liveness e readiness
├─ config/       validação de ambiente com Zod
└─ shared/       logger, correlação, auth, HMAC, Redis
```

Migrar para a **WhatsApp Cloud API oficial** da Meta é escrever `adapters/cloud-api/` e trocar uma linha em `whatsapp.module.ts`. Nenhum outro arquivo muda.

### Duas decisões que valem explicação

**O Baileys é ESM puro e a aplicação é CommonJS.** Por isso o `tsconfig` usa `module: node16` (que preserva o `import()` dinâmico em vez de rebaixá-lo para `require()`) e o adapter carrega a biblioteca sob demanda. Como o mapper não importa o Baileys em runtime, ele é testável sem nada disso.

**`TypedConfigService` e `REDIS_CLIENT` vivem fora dos arquivos de módulo.** O `AppConfigModule` valida o ambiente no momento em que é carregado; se o serviço morasse junto, qualquer teste unitário que importasse um service exigiria um `.env` completo.

## Rodando localmente

```bash
npm install
cp ../.env.example ../.env   # preencha os segredos
npm run start:dev
```

O app recusa subir com configuração inválida e diz qual campo corrigir.

| Comando | O que faz |
|---|---|
| `npm run start:dev` | Desenvolvimento com watch |
| `npm run build` | Compila para `dist/` |
| `npm run lint` | ESLint (type-aware) |
| `npm run format` | Prettier |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Testes end-to-end da API |

## API

Swagger completo em `http://localhost:3000/api/docs`.

Tudo sob `/api/v1` exige `X-Api-Key`. Os health checks são públicos.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/v1/messages` | Envia texto — substitui o `sendText` do WAHA |
| `POST` | `/api/v1/sessions/:id/start` | Conecta a sessão (idempotente) |
| `POST` | `/api/v1/sessions/:id/stop` | Encerra o socket sem desvincular |
| `DELETE` | `/api/v1/sessions/:id` | Desvincula e apaga credenciais |
| `GET` | `/api/v1/sessions/:id` | Estado da sessão |
| `GET` | `/api/v1/sessions/:id/qr` | QR pendente (`?format=png` para imagem) |
| `GET` | `/health/live` | Liveness — só confirma que o processo responde |
| `GET` | `/health/ready` | Readiness — sessão conectada e Redis acessível |

`live` não olha WhatsApp nem Redis de propósito: se olhasse, o Docker reiniciaria o container justamente durante uma reconexão.

## Variáveis de ambiente

Definidas e validadas em [src/config/env.schema.ts](src/config/env.schema.ts). O modelo completo está em [`.env.example`](../.env.example) na raiz.

As de ajuste mais frequente são as anti-ban: `WA_SEND_MIN_DELAY_MS`, `WA_SEND_MAX_DELAY_MS` e `WA_MAX_MSG_PER_MINUTE`. Atrasos maiores reduzem o risco de bloqueio; menores aumentam a vazão.

## Testes

63 testes. A cobertura foi direcionada ao que quebra em produção:

- **`baileys-event.mapper.spec.ts`** — payloads reais do Baileys: grupo, LID com `remoteJidAlt`, mensagem efêmera, ver-uma-vez aninhada, legenda de mídia, eco das próprias mensagens, ruído de protocolo, timestamp em `Long`
- **`text-formatter.service.spec.ts`** — o bug que chegava ao cidadão: HTML do Telegram virando `*negrito*` do WhatsApp
- **`dedupe.service.spec.ts`** — inclusive o comportamento com Redis fora do ar
- **`send-queue.service.spec.ts`** — serialização, ordem, atraso e isolamento entre sessões
- **`n8n-dispatcher.service.spec.ts`** — assinatura HMAC e política de retry
- **`test/gateway.e2e-spec.ts`** — API completa com o `AppModule` real

## Segurança

- API key comparada em tempo constante; rotas nascem protegidas e abrir exige `@Public()`
- Segredos mascarados no log
- **O conteúdo das mensagens nunca é registrado** — só `textLength`. É dado de saúde de cidadão identificável
- Container roda como usuário não-root, com `dumb-init` como PID 1 para desligamento gracioso
- `sessionId` sanitizado contra path traversal
