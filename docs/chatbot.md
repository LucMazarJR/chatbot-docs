# Chatbot de Atendimento via WhatsApp

Chatbot que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o modelo Gemini.

> Projeto do **PET-SAÚDE** (Programa de Educação pelo Trabalho para a Saúde, do Ministério da Saúde). O domínio é saúde humana e serviços públicos de saúde. Está em fase de teste com o grupo — ver [depende-de-voce.md](depende-de-voce.md).

Este documento é o guia de implementação: como o sistema funciona, como subir tudo do zero, e as armadilhas que já custaram tempo. Serve tanto para continuar nesta máquina quanto para levar o projeto a um lugar novo.

---

## Parte 1 — Como funciona

A arquitetura tem três peças, com responsabilidade separada e um único banco de conteúdo compartilhado:

- **`whatsapp-gateway`** (NestJS, pasta [backend/](../backend/)) — dono do canal: conexão, sessão, deduplicação, política anti-ban e formatação. Substitui o WAHA.
- **n8n** — dono da inteligência: agente Gemini, busca vetorial e memória da conversa.
- **Dashboard-PetSaúde** — painel de gestão das FAQs, em [repositório próprio](https://github.com/LucMazarJR/Dashboard-PetSaude), clonado dentro desta pasta como `Dashboard-PetSaude/`. Escreve na mesma base de FAQs que o chatbot lê.

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
    │               │  Buscar FAQs → Montar        │
    │               │  contexto → AI Agent          │
    │               │    ├─ MongoDB Vector Store   │
    │               │    └─ Redis Chat Memory      │
    │               └──────────────┬───────────────┘
    │                              │ POST /api/v1/messages + X-Api-Key
    │                              ▼
    │   resposta    ┌──────────────────────────────┐
    │◄──────────────┤  formata → fila anti-ban →   │
                    │  "digitando..." → envia      │
                    └──────────────────────────────┘

Dashboard-PetSaude (repositório separado, rodando à parte)
   front (TanStack Start) ──> back (NestJS) ──> MongoDB Atlas  (mesma base de FAQs)
                                            └──> PostgreSQL     (usuários, papéis, sessões)
```

O gateway é um backend próprio que **substituiu o WAHA**. Ele isola o Baileys atrás da porta `WhatsAppProvider`, entrega ao n8n um envelope canônico estável, e aplica política anti-ban (atraso aleatório, "digitando" simulado, teto por minuto).

### Serviços

| Serviço | Imagem / origem | Porta | Função |
|---|---|---|---|
| whatsapp-gateway | build de `./backend` | 3000 | Conexão com o WhatsApp, envio e recebimento |
| n8n | `n8nio/n8n` | 5678 | Orquestra o fluxo de resposta |
| redis | `redis:7-alpine` | interna | Deduplicação (db 1) e memória de conversa do n8n (db 0) |
| cloudflared | `cloudflare/cloudflared` | — | Expõe o n8n para a internet |
| postgres | `postgres:17-alpine` | 5432 (host configurável) | Identidade do Dashboard-PetSaúde — usuários, papéis, sessões. **Não guarda FAQ** |
| pwa | build de `./pwa` | 8080 | Protótipo de validação: mesmo RAG numa interface web, com nota do usuário e revisão das conversas — ver [prototipo-pwa.md](prototipo-pwa.md) |
| dashboard-api / dashboard-front | build de `./Dashboard-PetSaude` | 3333 / 5173 | Opcionais, atrás do profile `dashboard` — ver [Passo 6](#passo-6--dashboard-de-faqs) |

Volumes: `wa_sessions` (credenciais do WhatsApp — apagar exige novo QR), `n8n_data` (fluxos e credenciais), `redis_data`, `postgres_data` (usuários do dashboard).

### O que o gateway faz que o WAHA não fazia

| Recurso | Por quê |
|---|---|
| **Deduplicação** por id de mensagem (Redis, 24h) | O WhatsApp reentrega mensagens quando a conexão oscila. Sem isso o cidadão recebe a mesma resposta 2–3 vezes e cada repetição custa uma chamada ao Gemini |
| **Fila anti-ban** | Serializa envios, aplica atraso aleatório de 1,2–3s, limita a 20 msg/min e simula "digitando". Responder instantaneamente e em rajada é o padrão mais óbvio de automação |
| **Idempotência de envio** | O nó HTTP do n8n repete em timeout; sem isso, o cidadão receberia a resposta duplicada |
| **Formatação para WhatsApp** | Converte HTML/Markdown residual do LLM para `*negrito*` e `_itálico_` |
| **Reconexão automática** | Backoff exponencial, distinguindo queda temporária de sessão desvinculada |
| **Autenticação nos dois sentidos** | `X-Api-Key` na entrada, `X-Webhook-Token` + assinatura HMAC na saída |
| **Verificação do destinatário** | Número solto (não-JID) passa por `onWhatsApp()` antes do envio; sem conta no WhatsApp, devolve 400 em vez de sumir em silêncio |
| **Logs estruturados e sanitizados** | JSON com `correlationId` ligando a mensagem recebida à resposta enviada. O conteúdo das mensagens **nunca** é registrado — é dado de saúde. Falha de entrega ao n8n loga só mensagem/código/status/URL, nunca os headers com o token |

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

> `phoneE164` e `pushName` costumam vir `null`: o WhatsApp migrou para endereçamento LID (`...@lid`), e o número real não é mais entregue no evento. Não quebra nada — o fluxo responde usando o `chatId`, e enviar de volta para um `@lid` funciona normalmente.

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

### O fluxo no n8n

O fluxo do canal é [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json), na rota `/webhook/whatsapp`. A busca acontece sempre — não é uma ferramenta que o modelo pode ignorar (era assim numa versão anterior; ver [proposta-rag.md](proposta-rag.md) para o histórico da decisão).

> Existe um segundo fluxo, [n8n/pwa-chatbot.json](../n8n/pwa-chatbot.json), do protótipo de validação. Ele é uma cópia deste com outra rota, outro token e outra credencial do Gemini, e **não interfere no canal do WhatsApp** — ver [prototipo-pwa.md](prototipo-pwa.md). O que segue nesta seção descreve o fluxo de produção.

```
Webhook → If → Dados → Switch → Buscar FAQs → Montar contexto → AI Agent → Enviar resposta
                                  (mode: load)     (Code)           ↘ erro → aviso de indisponibilidade
                                                          ↘ não-texto → aviso de somente texto
```

| Nó | Configuração atual |
|---|---|
| **Webhook** | `/webhook/whatsapp`, autenticado por Header Auth |
| **If** | Só segue com `body.type == "message.received"` |
| **Dados** | Normaliza para `IdChat`, `TextoMensagem`, `NomeUser`, `IdMsg`, `TipoMensagem`, `EventId`, `SessionId`, `CorrelationId` |
| **Switch** | `TipoMensagem == "text"` segue para a busca; o resto vai para o aviso de somente texto (custo zero, nem chega no agente) |
| **Buscar FAQs** | Vector Store em `mode: load`, `topK: 10`, `preFilter: {"isActive": true}` — FAQ desativada no dashboard não entra na busca |
| **Montar contexto** | Nó Code: agrega os até 10 documentos num único item (senão o agente rodaria uma vez por documento e o cidadão receberia várias mensagens), descarta trechos com `score < 0.82` (evita misturar conteúdo irrelevante numa resposta), e reanexa os campos que o Vector Store derruba (`IdChat`, `EventId`, etc.) |
| **AI Agent** | `gemini-3.1-flash-lite` (cota gratuita de 500/dia), com retry de 3 tentativas contra sobrecarga. Prompt proíbe explicitamente misturar "não encontrei" com fragmentos de trechos que não respondem à pergunta |
| **Redis Chat Memory** | db 0, janela de **4 mensagens** (2 turnos), TTL de 1h |
| **Embeddings Google Gemini** | `gemini-embedding-2` — **precisa ser o mesmo modelo usado para indexar a base**, ver [seção de consistência](#a-regra-que-quebra-tudo-em-silêncio) |
| **Enviar \*** | Chamam `POST /api/v1/messages` no gateway, com `idempotencyKey = EventId` |

### Estado da base de FAQs

| | |
|---|---|
| Documentos | ~2450, ativos |
| Origem | Arquivos do Google Drive (pasta `FAQ VALIDADO`, ingeridos via [faq-scripts.md](faq-scripts.md)) + inserções pelo dashboard |
| Modelo de embedding | `gemini-embedding-2`, 3072 dimensões |
| Índice no Atlas | `vector_index_3072`, cosine, na collection `ministerio_saude.faq_medicamentos` |
| Texto embedado | `Assunto: … / Pergunta: … / Resposta: …` — o assunto entra no vetor, não só a pergunta e a resposta |

Confira o estado real a qualquer momento — não gasta cota:

```powershell
cd scripts
python -c "import os;from dotenv import load_dotenv;from pymongo import MongoClient;load_dotenv();c=MongoClient(os.getenv('MONGODB_URI'))['ministerio_saude']['faq_medicamentos'];print('total',c.count_documents({}),'| modelo 2:',c.count_documents({'embedding_model':'gemini-embedding-2'}),'| sem vetor:',c.count_documents({'embedding':None}))"
```

### O dashboard

Repositório **separado**, clonado em `Dashboard-PetSaude/` — o `.gitignore` desta raiz o ignora de propósito, porque ele tem git e remote próprios.

- **back** — NestJS na porta 3333. Lê e escreve as FAQs no mesmo Mongo do chatbot; identidade (usuários, papéis, sessões) fica no Postgres, banco totalmente separado
- **front** — TanStack Start na porta 5173
- Login individual com JWT em cookie httpOnly (nunca chega ao JavaScript do navegador), três papéis: `admin` (gerencia usuários e FAQs), `editor` (cria/edita/exclui FAQs), `leitor` (só consulta)
- Sessões revogáveis: desativar um usuário ou trocar senha derruba o acesso na hora, sem esperar o token expirar
- Paginação no servidor em todas as listagens

#### As quatro telas que vieram do primeiro teste com participantes

| Tela | O que resolve |
|---|---|
| **Conversas** (`/conversas`, admin) | As conversas do protótipo, com os trechos que geraram cada resposta e o score de cada um. Clicar num trecho abre a FAQ que o produziu — é o caminho da resposta ruim até o documento que precisa ser corrigido |
| **Categorias** (`/categorias`) | A lista oficial de assuntos, definida pela equipe de saúde, e a fila do que está fora dela |
| **Sem resposta** (`/curadoria`, admin) | As perguntas que o chatbot não soube responder, agrupadas por um modelo em sugestões de FAQ |
| **Testar a busca** (na home das FAQs) | Roda a busca do chatbot para uma pergunta digitada e mostra os scores, sem passar pelo chatbot |

**Por que as categorias viraram entidade.** Categoria era um agregado derivado: o resultado de um `$group` sobre o campo `category` das FAQs. Quem "criava" uma categoria era quem digitava um nome novo no formulário. O resultado foram **236 categorias distintas para 2491 FAQs**, boa parte delas a mesma coisa escrita de outro jeito — a criação manual gravava o que foi digitado e a importação forçava minúsculo, então "Exames" e "exames" viraram dois assuntos. Como a categoria entra no texto embedado (`Assunto: …`), isso são dois temas diferentes para a busca. A lista agora tem chave canônica e índice único; começa **vazia**, porque quem decide quais assuntos existem é a área de saúde.

**Por que o teste de busca existe.** A única forma de saber por que o chatbot não respondeu algo era mandar a pergunta pelo chat e esperar — minutos, dependendo do n8n estar de pé, e sem ver os scores. E o "por quanto" é o que decide o trabalho: *"Onde fica a UBS?"* deu 0,816 contra um corte de 0,82. Sem o número, esse caso e um de conteúdo realmente faltando são indistinguíveis — e a correção de um é o oposto da do outro.

**O que a curadoria custa.** Uma chamada de geração por rodada de até 10 perguntas, e **nenhum embedding**: as FAQs vizinhas de cada pergunta já ficaram gravadas em `trechosDebug` quando o chatbot respondeu. O modelo agrupa e propõe, mas **não escreve orientação de saúde**: a resposta sai vazia quando as FAQs fornecidas não continham a informação, e aí a lacuna é de conteúdo mesmo. Toda rodada fica registrada em `curadoria_rodadas` com as perguntas que entraram e a resposta crua do modelo.

### Dependências externas

- **MongoDB Atlas** — base vetorial de FAQs, compartilhada entre chatbot, ingestão e dashboard
- **Google Gemini API** — modelo de chat e embeddings
- **Cloudflare Tunnel** — exposição pública do webhook do n8n

---

## Parte 2 — Como subir do zero

### Pré-requisitos

- Docker e Docker Compose
- Cluster MongoDB Atlas com índice vetorial configurado
- Chave de API do Google Gemini
- Tunnel do Cloudflare com token
- Um celular com WhatsApp para parear
- Node **não é necessário** para o chatbot — o build acontece dentro do container. Só é preciso se for rodar o dashboard localmente (fora do Docker)

---

### Passo 1 — Criar o `.env`

```powershell
cp .env.example .env
```

Gere cada segredo distinto:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Preencha `GATEWAY_API_KEY`, `N8N_WEBHOOK_TOKEN`, `N8N_WEBHOOK_SECRET`, `REDIS_PASSWORD` e `POSTGRES_PASSWORD`, mais o token e a URL do Cloudflare, `MONGODB_URI` e `GEMINI_API_KEY`.

⚠️ **A `MONGODB_URI` precisa ter o nome do banco no caminho** — `.../ministerio_saude?appName=...`, não `.../?appName=...`. Sem o nome do banco, o driver assume `test`, e existe um `test.faq_medicamentos` com 2 documentos de lixo nesse cluster. A aplicação sobe normalmente, conecta, e simplesmente não encontra as FAQs reais — sem erro nenhum. Já quebrou o n8n e o dashboard, dos dois lados, exatamente assim.

O gateway valida a configuração no boot e **recusa subir** com valores faltando ou com menos de 16 caracteres — a mensagem de erro diz exatamente qual campo corrigir.

---

### Passo 2 — Subir os containers

```powershell
docker compose up -d --build
docker compose ps
```

Se o Postgres não subir com erro de *"socket forbidden"*, a porta 5432 do host está ocupada por uma instalação nativa — não é conflito óbvio a partir da mensagem. Troque `POSTGRES_HOST_PORT` no `.env` (ex.: `55432`).

---

### Passo 3 — Parear o WhatsApp

O gateway inicia a sessão sozinho e gera o QR code.

**O ASCII do QR não sai no log em produção** — o [baileys.provider.ts:256](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts#L256) só desenha se `NODE_ENV` não for `production`, que é o padrão do compose. Baixe o PNG:

```powershell
$KEY = ((Get-Content .env | Select-String '^GATEWAY_API_KEY=') -split '=',2)[1].Trim()
curl.exe -sS -f -H "X-Api-Key: $KEY" "http://localhost:3000/api/v1/sessions/default/qr?format=png" -o qr.png
if ($?) { (Get-Item qr.png).Length; start qr.png }
```

Um 401 vira um `qr.png` de ~200 bytes que nenhum visualizador abre — **confira o tamanho** antes de tentar abrir. Alguns KB = QR real.

⚠️ **Antes de escanear, desconecte todos os aparelhos** em WhatsApp → Configurações → Aparelhos conectados. Se houver mais de uma sessão pendurada, o WhatsApp derruba uma com `Stream Errored (conflict)`, o gateway classifica isso como `loggedOut` e **apaga as credenciais automaticamente**. Sintoma: `CONNECTED` seguido de "Sessão desvinculada" em menos de 1 segundo.

No celular: **Configurações → Aparelhos conectados → Conectar um aparelho** e escaneie.

Confirme que a conexão **sustenta** (espere ~30s, não baste ver `CONNECTED` uma vez):

```powershell
curl.exe -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/sessions/default
curl.exe -s -o nul -w "ready: HTTP %{http_code}" http://localhost:3000/health/ready
```

Quer `"status":"CONNECTED"` e `ready: HTTP 200`.

A sessão fica no volume `wa_sessions` e sobrevive a restarts.

> ⚠️ **Nunca** use `DELETE /api/v1/sessions/default` — apaga as credenciais e exige QR novo.

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

### Passo 5 — Credenciais e fluxo no n8n

Acesse `http://localhost:5678` e cadastre:

| Credencial | Valores |
|---|---|
| **Redis** | host `redis`, porta `6379`, senha = `REDIS_PASSWORD`, **database `0`** |
| **MongoDB** | connection string do Atlas |
| **Google Gemini** | chave de API |
| **Header Auth** | nome `Gateway Webhook Token` · Name: `X-Webhook-Token` · Value: o `N8N_WEBHOOK_TOKEN` do `.env` |

> O gateway usa o **db 1** do Redis e o n8n o **db 0**, de propósito: assim a deduplicação e a memória de conversa não colidem.

⚠️ **A credencial pela tela às vezes não cola** — aconteceu com o Header Auth: a tela dava como salvo, e o webhook continuava devolvendo 403. O caminho confiável, se isso acontecer:

```powershell
docker compose exec -T n8n n8n import:credentials --input=/tmp/cred.json
```

Depois: **Workflows → Import from File** → [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json), vincule as quatro credenciais (os nós vêm marcados), confirme que **Redis Chat Memory** está ligado ao **AI Agent**, e **ative** o workflow.

⚠️ **Importar pelo CLI desativa o fluxo.** O `import:workflow` respeita o campo `active` do JSON — depois de importar é preciso `n8n publish:workflow --id=...` **e reiniciar o container do n8n** para a rota voltar a responder.

---

### Passo 6 — Dashboard de FAQs

Opcional para o chatbot funcionar, mas é como o time gerencia o conteúdo sem mexer no banco na mão.

**No compose** — sobe junto com o resto:

```powershell
# no .env: COMPOSE_PROFILES=dashboard
docker compose up -d
# API em 127.0.0.1:3333, painel em 127.0.0.1:5173
```

As migrations do Postgres rodam sozinhas no boot (`DB_RUN_MIGRATIONS=true`). Crie o primeiro administrador uma vez:

```powershell
docker compose exec dashboard-api node dist/database/seeds/create-admin.js
```

**Localmente** — para desenvolver com hot reload:

```powershell
cd Dashboard-PetSaude/back
pnpm install
pnpm run migration:run
pnpm run seed:admin      # usa ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD do .env
pnpm run start:dev

# noutro terminal
cd Dashboard-PetSaude/front
npx vite dev --port 5173
```

⚠️ **As duas formas disputam as portas 3333 e 5173** — pare o container antes de rodar `pnpm start:dev`, ou vice-versa.

O seed é **idempotente**: se já houver usuário, não faz nada. A senha do admin é provisória — a troca é exigida no primeiro acesso.

---

### Passo 7 — Testar de ponta a ponta

Mande uma mensagem de outro celular. Acompanhe em **n8n → Executions** e nos logs:

```powershell
docker compose logs -f whatsapp-gateway
```

Cada mensagem gera um `correlationId` que aparece em todas as linhas de log daquele atendimento.

Roteiro mínimo: uma saudação (`oi`), uma pergunta com resposta na base, uma pergunta fora de escopo (deve admitir que não sabe, não inventar), e três perguntas seguidas sobre assuntos diferentes (as três respostas precisam ser diferentes entre si — é o teste do "bot viciado" documentado em [proposta-rag.md](proposta-rag.md)).

---

### Checklist

- [ ] `.env` com os segredos gerados e `MONGODB_URI` com o nome do banco no caminho
- [ ] `docker compose ps` com todos os serviços saudáveis
- [ ] Sessão em `CONNECTED`, e sustentando depois de 30s
- [ ] Envio direto pela API funcionou (Passo 4)
- [ ] Quatro credenciais cadastradas no n8n, fluxo importado e **ativo**
- [ ] Mensagem de teste respondida com formatação correta (sem tags `<b>`)
- [ ] Três perguntas seguidas sobre assuntos diferentes deram três respostas diferentes
- [ ] (Se o dashboard subiu) login funciona, e uma FAQ criada lá aparece na busca do bot

---

## A regra que quebra tudo em silêncio

**O modelo de embedding precisa ser idêntico em três lugares.** Divergir não gera erro em lugar nenhum — a busca simplesmente devolve resultado ruim, ou a FAQ nunca aparece.

| Onde | Configuração |
|---|---|
| Ingestão | `GEMINI_EMBEDDING_MODEL` no `.env` da raiz → [lib/gemini_embendding.py](../scripts/lib/gemini_embendding.py) |
| Dashboard | `GEMINI_EMBEDDING_MODEL` no `Dashboard-PetSaude/back/.env` |
| n8n | nó `Embeddings Google Gemini` do fluxo |

Hoje os três estão em `gemini-embedding-2`, com 3072 dimensões. O `task_type` **não** está alinhado — a ingestão usa `SEMANTIC_SIMILARITY` explícito e o nó do n8n usa o padrão dele — mas corrigir isso exigiria reindexar a base inteira de novo, então fica registrado como dívida em aberto.

Trocar de modelo exige **reindexar todas as FAQs** ([reindexar_embeddings.py](../scripts/reindexar_embeddings.py)) e atualizar os três lugares. Não é uma troca de uma linha.

---

## Armadilhas já descobertas

Cada uma custou tempo. Não repita.

**URI do Mongo sem nome de banco.** Ver Passo 1. É a que mais já mordeu — n8n e dashboard, separadamente.

**QR ASCII não sai no log em produção.** Ver Passo 3.

**`curl --output` grava erro como imagem.** Ver Passo 3.

**Conflito de aparelhos apaga as credenciais.** Ver Passo 3.

**LID: `phoneE164` e `pushName` vêm `null`.** Ver Parte 1, contrato gateway → n8n.

**`N8N_BLOCK_ENV_ACCESS_IN_NODE` bloqueia `$env` nos nós.** Com ele ligado (padrão do n8n), o fluxo executa, o agente responde, gasta cota — e a resposta morre no nó HTTP, sem erro visível no gateway. O `docker-compose.yml` já define `false` para este serviço.

**pnpm 11 recusa rodar scripts com builds pendentes.** No `Dashboard-PetSaude/back`, migrations, seed e build falham com `ERR_PNPM_IGNORED_BUILDS`, que não menciona nenhum dos três comandos. A aprovação vive no `pnpm-workspace.yaml` (`allowBuilds`).

**Trocar o `N8N_WEBHOOK_TOKEN` exige mexer em dois lugares.** O `.env` alimenta o gateway, mas o n8n valida contra a credencial `Header Auth account`, que é independente. Mudar só um dos dois faz toda entrega voltar 403.

```powershell
# 1. gerar e gravar o novo valor no .env
$novo = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
# 2. atualizar a credencial do n8n (tela ou CLI — ver Passo 5)
# 3. docker compose up -d whatsapp-gateway   (recriar, não reiniciar: a variável
#    é injetada na CRIAÇÃO do container)
# 4. docker compose restart n8n
```

Confirme batendo no webhook: token antigo deve devolver 403, o novo 200.

**Vite/Nitro do dashboard front tem Cloudflare Workers como alvo padrão do build.** O `@lovable.dev/vite-tanstack-config` fixa isso por padrão. Buildado com `docker build` sem ajuste, o `.output/server/index.mjs` sai como Worker: rodado com `node`, encerra na hora, código 0, sem log — o container fica reiniciando em silêncio. O [Dockerfile do front](../Dashboard-PetSaude/front/Dockerfile) já define `NITRO_PRESET=node-server`. Ao publicar noutra plataforma (Vercel, Cloudflare Pages), reavalie se o preset automático da plataforma já resolve ou se precisa forçar de novo.

---

## Migração a partir do WAHA

**Será necessário ler o QR code de novo.** O WAHA guardava as credenciais em formato próprio no volume `waha_data`, que não é reaproveitável.

Como o WhatsApp permite vários aparelhos vinculados, dá para parear o gateway novo **com o WAHA ainda no ar** e validar antes de cortar.

**Rollback: não existe mais.** Ele dependia do volume `waha_data`, que guardava as credenciais do WhatsApp em formato próprio do WAHA — e esse volume já não existe. Sem ele, "voltar" significaria ler o QR code de novo, que é exatamente o custo da migração para frente. O fluxo antigo (`Whatsaap PET-BOT.json`, da época do Telegram) foi removido do repositório junto com essa promessa: ele apontava para `gemini-2.5-flash-lite` e `gemini-embedding-001`, modelos que a base já não usa, e importá-lo hoje geraria vetores incompatíveis com o `vector_index_3072`. Continua no histórico do git, se algum dia fizer falta.

---

## Dívidas técnicas conhecidas

| # | Dívida | Onde | Impacto |
|---|---|---|---|
| 1 | 🟡 `task_type` da busca no n8n não é controlado | nó Embeddings | Ver [seção de consistência](#a-regra-que-quebra-tudo-em-silêncio) acima |
| 2 | Credenciais da sessão em disco local (`wa_sessions`) | backend | Não escala para mais de uma réplica |
| 3 | Fila de envio em memória | backend | Um restart perde o que estava na fila |
| 4 | Entrega ao n8n sem outbox transacional | webhooks | Se o n8n ficar fora além do retry, o evento é perdido (fica registrado no log com o `eventId`) |
| 5 | n8n valida token, não a assinatura HMAC | n8n | Proteção menor que a possível; o gateway já envia a assinatura |
| 6 | Só recebe e envia texto | backend | Áudio e imagem caem no aviso de somente texto |
| 7 | Sem consentimento e retenção LGPD | — | Ver [depende-de-voce.md](depende-de-voce.md#7-lgpd--dado-de-saúde-é-dado-sensível) |
| 8 | Baileys não-oficial | backend | Risco de bloqueio do número |

Resolvidas recentemente, registradas porque a correção não é óbvia a quem for procurar:

- **`limpar_banco.py` recriava o índice com 768 dimensões** (incompatível com os vetores de 3072) — hoje usa a dimensão certa, exige `--confirmo-apagar-tudo` **e** confirmação digitada, e aponta para `backup_faqs.py` antes de apagar
- **O gateway logava o `X-Webhook-Token` em texto claro** em toda falha de entrega ao n8n — o log passou a sair sanitizado (mensagem, código, status, URL — nunca headers)
- **Três variáveis do schema não chegavam ao container** — `N8N_WEBHOOK_TIMEOUT_MS`, `N8N_WEBHOOK_MAX_RETRIES` e `DEDUPE_TTL_SECONDS` agora são repassadas pelo compose
- **FAQs desativadas continuavam sendo recuperadas pela busca** — o fluxo usa `preFilter: {"isActive": true}`
- **O log da desvinculação de sessão não registrava o motivo** — agora sai com `statusCode` e a mensagem do erro, o que distingue desvinculação real de conflito de aparelhos
- **Envio não validava se o número existe no WhatsApp** — número solto passa por `onWhatsApp()` e devolve 400 quando não há conta; JIDs vindos do próprio webhook pulam a checagem
- **Segurança:** o range `^6.7.0` do `@whiskeysockets/baileys` alcançava a versão `6.17.16`, descontinuada por uma falha que permite falsificação de mensagens ([GHSA-qvv5-jq5g-4cgg](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg)) — 6.17.16 é *maior* que 6.7.24 em semver, então o caret resolvia para a versão vulnerável. O range foi fechado em `~6.7.24`

---

## O atalho da condensação não funciona

**O problema.** Pergunta de acompanhamento busca com a frase crua. "como chego lá?" é embedado sem referente nenhum, a busca devolve lixo, e o agente recebe a memória do Redis certinha e nenhum conteúdo — então responde "não encontrei". **A memória não é o problema: quem precisava do histórico era a busca, e ela não o vê.** No primeiro teste com participantes, ao menos 4 dos 28 "não encontrei" eram isso.

**O atalho que parecia óbvio.** Em vez de uma chamada de LLM para reescrever a pergunta, concatenar a pergunta anterior ao texto da busca. Custo zero, latência zero. Medido com a busca real, contra os casos reais:

| Pergunta | Anterior | Só a frase | Com a anterior |
|---|---|---|---|
| "ata e como chego la" | "aeroporto" | 0,776 — *"Por que quem chegou depois foi atendido primeiro"* | 0,788 — *"A UPA do Aeroporto atende 24 horas?"* |
| "como chego la ?" | "ata e como chego la" | 0,803 — *"Como as bactérias chegam ao coração?"* | 0,811 — *"NAIA, como entrar em contato"* |
| "E fralda geriatrica?" | "Onde consigo pegar salbutamol?" | 0,813 — *"Qualquer médico pode receitar Alendronato?"* | **0,909 — *"Onde conseguir Salbutamol gratuito?"*** |

**Os dois primeiros continuam abaixo do corte de 0,82** — o tema melhora (de "bactérias no coração" para "UPA do Aeroporto"), mas não passa, porque a base **não tem** FAQ de como chegar às unidades. Ali a lacuna é de conteúdo, e já foi para a fila de curadoria como *"Como faço para chegar a uma unidade de saúde?"*, com resposta vazia.

**O terceiro é pior que falhar.** O score subiu para 0,909 e três trechos passaram — mas o melhor deles é sobre **salbutamol**, a pergunta anterior. A pergunta era sobre fralda geriátrica. A concatenação fez o assunto velho dominar o vetor, e o agente receberia como contexto relevante um texto de outro medicamento. É exatamente a falha que o comentário do `LIMIAR_SCORE` descreve: *um número real, tirado de um trecho sobre outro assunto e apresentado como se valesse para a pergunta feita, é pior do que admitir que não sabe*.

**Conclusão:** concatenar é pior que não fazer nada. Não ajuda onde falta conteúdo, e onde "ajuda" é trocando a pergunta da pessoa pela anterior. A condensação por LLM é diferente porque ela **resolve a referência e descarta o assunto anterior** — reescreveria "E fralda geriátrica?" como "Onde consigo pegar fralda geriátrica?", sem arrastar o salbutamol junto. Ou se faz assim, ou não se faz.

---

## Decisões que dependem de você

Detalhamento em [depende-de-voce.md](depende-de-voce.md).

| Decisão | Por que agora |
|---|---|
| **Billing do Gemini** | A cota gratuita de embeddings é de **1000/dia por projeto**; o chat, 500/dia no modelo em uso. O fluxo gasta 1 de cada por mensagem, então esse é o teto diário de conversas |
| **Condensação de query** | ⚠️ **A condição já foi satisfeita — e o atalho barato foi testado e reprovado.** Ver [a medição](#o-atalho-da-condensação-não-funciona) abaixo. Resta decidir se vale a correção completa, que custa uma chamada de LLM a mais por mensagem sobre uma latência que já é o maior problema de experiência |
| **Tier do MongoDB Atlas** | Se for M0, há limite de conexões simultâneas e de índices de busca |

Itens de prazo longo (número institucional, API oficial da Meta, hospedagem, LGPD das conversas) estão em [depende-de-voce.md](depende-de-voce.md#quando-sair-do-teste). A verificação da Meta leva semanas.
