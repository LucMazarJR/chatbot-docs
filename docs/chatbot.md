# Chatbot de Atendimento via WhatsApp

Chatbot que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o modelo Gemini.

A arquitetura tem duas peças de responsabilidade bem separada:

- **`whatsapp-gateway`** (NestJS, pasta [backend/](../backend/)) — dono do canal: conexão, sessão, deduplicação, política anti-ban e formatação. Substitui o WAHA.
- **n8n** — dono da inteligência: agente de IA, busca vetorial e memória da conversa.

> Projeto do **PET-SAÚDE** (Programa de Educação pelo Trabalho para a Saúde, do Ministério da Saúde). O domínio é saúde humana e serviços públicos de saúde. Está em fase de teste com o grupo — ver [depende-de-voce.md](depende-de-voce.md).

---

## Parte 1 — Como funciona

### Fluxo de uma mensagem

```
                    ┌──────────────────────────────┐
  Cidadão           │      whatsapp-gateway        │
    │               │                              │
    │  mensagem     │  Baileys → normaliza →       │
    ├──────────────►│  dedupe → envelope canônico  │
    │               │              │               │
    │               └──────────────┼───────────────┘
    │                              │ POST + X-Webhook-Token
    │                              ▼
    │               ┌──────────────────────────────┐
    │               │            n8n               │
    │               │  If → Dados → Switch →       │
    │               │  AI Agent (Gemini)           │
    │               │    ├─ MongoDB Vector Store   │
    │               │    └─ Redis Chat Memory      │
    │               └──────────────┬───────────────┘
    │                              │ POST /api/v1/messages + X-Api-Key
    │                              ▼
    │   resposta    ┌──────────────────────────────┐
    │◄──────────────┤  formata → fila anti-ban →   │
                    │  "digitando..." → envia      │
                    └──────────────────────────────┘
```

### Serviços

| Serviço | Imagem / origem | Porta | Função |
|---|---|---|---|
| whatsapp-gateway | build de `./backend` | 3000 | Conexão com o WhatsApp, envio e recebimento |
| n8n | `n8nio/n8n` | 5678 | Orquestra o agente de IA |
| redis | `redis:7-alpine` | interna | Deduplicação (db 1) e memória de conversa do n8n (db 0) |
| cloudflared | `cloudflare/cloudflared` | — | Expõe o n8n para a internet |

Volumes: `wa_sessions` (credenciais do WhatsApp — apagar exige novo QR), `n8n_data` (fluxos e credenciais), `redis_data`.

### O que o gateway faz que o WAHA não fazia

| Recurso | Por quê |
|---|---|
| **Deduplicação** por id de mensagem (Redis, 24h) | O WhatsApp reentrega mensagens quando a conexão oscila. Sem isso o cidadão recebe a mesma resposta 2–3 vezes e cada repetição custa uma chamada ao Gemini |
| **Fila anti-ban** | Serializa envios, aplica atraso aleatório de 1,2–3s, limita a 20 msg/min e simula "digitando". Responder instantaneamente e em rajada é o padrão mais óbvio de automação |
| **Idempotência de envio** | O nó HTTP do n8n repete em timeout; sem isso, o cidadão receberia a resposta duplicada |
| **Formatação para WhatsApp** | Converte HTML/Markdown residual do LLM para `*negrito*` e `_itálico_` |
| **Reconexão automática** | Backoff exponencial, distinguindo queda temporária de sessão desvinculada |
| **Autenticação nos dois sentidos** | `X-Api-Key` na entrada, `X-Webhook-Token` + assinatura HMAC na saída |
| **Logs estruturados** | JSON com `correlationId` ligando a mensagem recebida à resposta enviada. O conteúdo das mensagens **nunca** é registrado — é dado de saúde |

### Contrato: gateway → n8n

```http
POST http://n8n:5678/webhook/whatsapp
X-Webhook-Token: <N8N_WEBHOOK_TOKEN>
X-Signature-256: sha256=<HMAC do corpo>
X-Correlation-Id: <uuid>
```

```json
{
  "eventId": "e7c3...",
  "type": "message.received",
  "occurredAt": "2026-08-04T13:22:31.412Z",
  "sessionId": "default",
  "message": {
    "id": "3EB0C767D26B8F3A1",
    "chatId": "5516999998888@s.whatsapp.net",
    "from": { "phoneE164": "+5516999998888", "pushName": "Maria" },
    "type": "text",
    "text": "quais exames precisam de jejum?",
    "quotedMessageId": null,
    "isGroup": false,
    "timestamp": "2026-08-04T13:22:30.000Z"
  }
}
```

Mensagens não-texto chegam com `"type": "audio" | "image" | ...` e `"text": null` — quem decide a resposta continua sendo o n8n.

Eventos de sessão usam `"type": "session.status"` e trazem `status` e `phoneE164` no lugar de `message`.

### Contrato: n8n → gateway

```http
POST http://whatsapp-gateway:3000/api/v1/messages
X-Api-Key: <GATEWAY_API_KEY>
```

```json
{
  "sessionId": "default",
  "to": "5516999998888@s.whatsapp.net",
  "type": "text",
  "text": "Para o exame de zinco: *jejum* de 8 horas.",
  "idempotencyKey": "e7c3..."
}
```

Resposta `202`:
```json
{ "id": "3EB0...", "status": "sent", "sessionId": "default", "to": "5516999998888@s.whatsapp.net" }
```

A requisição só retorna depois que a mensagem foi entregue ao WhatsApp — como ela passa pela fila anti-ban, espere alguns segundos. É proposital: o n8n recebe o id real e o erro real.

A referência completa da API fica em `http://localhost:3000/api/docs` (Swagger).

### Fluxo no n8n

Arquivo: [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json)

```
Webhook → If → Dados → Switch → AI Agent → Enviar resposta
                                    ↘ erro → Enviar aviso de indisponibilidade
                          ↘ não-texto → Enviar aviso de somente texto
```

| Nó | Função |
|---|---|
| **Webhook** | Recebe em `/webhook/whatsapp`, autenticado por Header Auth |
| **If** | Só segue com `body.type == "message.received"` |
| **Dados** | Normaliza para `IdChat`, `TextoMensagem`, `NomeUser`, `IdMsg`, `TipoMensagem`, `EventId`, `SessionId`, `CorrelationId` |
| **Switch** | `TipoMensagem == "text"` segue para o agente; o resto vai para o aviso de somente texto |
| **AI Agent** | Gemini `2.5-flash-lite`, com Redis Chat Memory (10 mensagens, TTL 1h) e o vector store como ferramenta |
| **MongoDB Atlas Vector Store** | Busca semântica na coleção `faq_medicamentos` |
| **Enviar \*** | Chamam `POST /api/v1/messages` no gateway, com `idempotencyKey = EventId` e retry automático |

### Dependências externas

- **MongoDB Atlas** — base vetorial de FAQs
- **Google Gemini API** — modelo de chat e embeddings
- **Cloudflare Tunnel** — exposição pública do webhook

---

## Parte 2 — Como subir do zero

### Pré-requisitos

- Docker e Docker Compose
- Cluster MongoDB Atlas com índice vetorial configurado
- Chave de API do Google Gemini
- Tunnel do Cloudflare com token
- Um celular com WhatsApp para parear

---

### Passo 1 — Criar o `.env`

```powershell
cp .env.example .env
```

Gere **quatro segredos distintos**:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Preencha `GATEWAY_API_KEY`, `N8N_WEBHOOK_TOKEN`, `N8N_WEBHOOK_SECRET` e `REDIS_PASSWORD`, mais o token e a URL do Cloudflare.

O gateway valida a configuração no boot e **recusa subir** com valores faltando ou com menos de 16 caracteres — a mensagem de erro diz exatamente qual campo corrigir.

---

### Passo 2 — Subir os containers

```powershell
docker compose up -d --build
docker compose ps
```

---

### Passo 3 — Parear o WhatsApp

O gateway inicia a sessão sozinho e gera o QR code.

Abra no navegador:

```
http://localhost:3000/api/v1/sessions/default/qr?format=png
```

> O endpoint exige o header `X-Api-Key`. Para abrir direto no navegador durante o setup, use o QR que aparece **no log do container** — em desenvolvimento ele é desenhado em ASCII:
> ```powershell
> docker compose logs -f whatsapp-gateway
> ```

No celular: **Configurações → Aparelhos conectados → Conectar um aparelho** e escaneie.

Confirme:

```powershell
curl.exe -H "X-Api-Key: <GATEWAY_API_KEY>" http://localhost:3000/api/v1/sessions/default
```

Deve retornar `"status": "CONNECTED"`.

A sessão fica no volume `wa_sessions` e sobrevive a restarts.

---

### Passo 4 — Testar o envio, sem o n8n

Este passo isola o gateway e prova que a parte mais crítica funciona:

```powershell
curl.exe -X POST http://localhost:3000/api/v1/messages `
  -H "X-Api-Key: <GATEWAY_API_KEY>" `
  -H "Content-Type: application/json" `
  -d '{\"to\":\"5516999998888\",\"text\":\"Teste do gateway\"}'
```

A mensagem deve chegar no celular de destino em alguns segundos (o atraso é a fila anti-ban).

---

### Passo 5 — Credenciais no n8n

Acesse `http://localhost:5678` e cadastre:

| Credencial | Valores |
|---|---|
| **Redis** | host `redis`, porta `6379`, senha = `REDIS_PASSWORD`, **database `0`** |
| **MongoDB** | connection string do Atlas |
| **Google Gemini** | chave de API |
| **Header Auth** | nome `Gateway Webhook Token` · Name: `X-Webhook-Token` · Value: o `N8N_WEBHOOK_TOKEN` do `.env` |

> O gateway usa o **db 1** do Redis e o n8n o **db 0**, de propósito: assim a deduplicação e a memória de conversa não colidem.

---

### Passo 6 — Importar o fluxo

1. **Workflows → Import from File**
2. Importe [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json)
3. Vincule as quatro credenciais (os nós vêm com placeholders e aparecem marcados)
4. Confirme que o nó **Redis Chat Memory** está ligado ao **AI Agent**

O webhook já é o mesmo caminho de antes (`/webhook/whatsapp`), então a URL pública não muda.

---

### Passo 7 — Ativar e testar

Ative o workflow (toggle no canto superior direito) e mande uma mensagem de outro celular.

Acompanhe em **n8n → Executions** e nos logs:

```powershell
docker compose logs -f whatsapp-gateway
```

Cada mensagem gera um `correlationId` que aparece em todas as linhas de log daquele atendimento.

---

### Checklist

- [ ] `.env` com os quatro segredos distintos
- [ ] `docker compose ps` com todos os serviços saudáveis
- [ ] Sessão em `CONNECTED`
- [ ] Envio direto pela API funcionou (Passo 4)
- [ ] Quatro credenciais cadastradas no n8n
- [ ] Fluxo importado, credenciais vinculadas, memória conectada
- [ ] Workflow ativo
- [ ] Mensagem de teste respondida com formatação correta (sem tags `<b>`)
- [ ] Pergunta de acompanhamento provou que o bot lembra do contexto

---

## Migração a partir do WAHA

**Será necessário ler o QR code de novo.** O WAHA guardava as credenciais em formato próprio no volume `waha_data`, que não é reaproveitável.

Como o WhatsApp permite vários aparelhos vinculados, dá para parear o gateway novo **com o WAHA ainda no ar** e validar antes de cortar.

**Rollback:** o volume `waha_data` e o fluxo original [n8n/Whatsaap PET-BOT.json](../n8n/Whatsaap%20PET-BOT.json) foram preservados. Para voltar, reverta o `docker-compose.yml`, suba o serviço `waha` e reaponte o webhook pelo dashboard dele.

---

## Limitações conhecidas da Fase 1

Documentadas de propósito — são o escopo das fases seguintes:

| Limitação | Impacto | Resolvida em |
|---|---|---|
| Credenciais da sessão em disco local | Não escala para mais de uma réplica | Fase 2 (Postgres) |
| Fila de envio em memória | Um restart perde o que estava na fila | Fase 2 (BullMQ) |
| Entrega ao n8n sem outbox transacional | Se o n8n ficar fora além do retry, o evento é perdido (fica registrado no log com o `eventId`) | Fase 2 (outbox) |
| n8n valida token, não a assinatura HMAC | Proteção menor que a possível; o gateway já envia a assinatura | Fase 2 |
| Só recebe e envia texto | Áudio e imagem caem no aviso de somente texto | Fase 3 |
| Sem consentimento e retenção LGPD | Ver [depende-de-voce.md](depende-de-voce.md#7-lgpd--dado-de-saúde-é-dado-sensível) | Fase 4 |
| Baileys não-oficial | Risco de bloqueio do número | Fase 5 (Cloud API) |
