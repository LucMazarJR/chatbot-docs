# Handoff — estado do projeto e como retomar

> **Como usar:** abra o Claude Code na pasta do projeto e cole:
>
> *"Leia `docs/handoff-notebook.md`. Estou retomando este projeto. Me guie a partir da seção 'Subir tudo do zero'. Modo mentor: me explique o caminho e deixe eu executar, não implemente por mim."*
>
> Última sessão: **21/08/2026**. Máquina: Windows 11 + PowerShell 5.1 + Docker Desktop.

---

## 1. O projeto em um minuto

Chatbot de saúde no WhatsApp do **PET-SAÚDE** (Programa de Educação pelo Trabalho para a Saúde — "PET" é o programa, não animal de estimação). Responde dúvidas de cidadãos sobre exames, medicamentos, unidades e procedimentos, a partir de uma base de FAQs.

**Situação:** fase de teste interna. O grupo testa antes de qualquer atendimento real.

```
WhatsApp ──> whatsapp-gateway (NestJS + Baileys) ──webhook──> n8n ──> AI Agent (Gemini)
                    ▲                                                      │
                    └──────── POST /api/v1/messages ───────────────────────┘
                                                              MongoDB Atlas (FAQs + vetores)
                                                              Redis (memória de conversa)

Dashboard-PetSaude (repositório separado)
   front (TanStack Start) ──> back (NestJS) ──> MongoDB Atlas  (mesmas FAQs)
                                            └─> PostgreSQL     (usuários e sessões)
```

O gateway é um backend próprio que **substituiu o WAHA**. Ele isola o Baileys atrás da porta `WhatsAppProvider`, entrega ao n8n um envelope canônico estável, e aplica política anti-ban (atraso aleatório, "digitando" simulado, teto por minuto).

Serviços no `docker-compose.yml`: `whatsapp-gateway`, `n8n`, `redis`, `cloudflared`, `postgres`.

Documentação: [chatbot.md](chatbot.md) (arquitetura do gateway), [depende-de-voce.md](depende-de-voce.md) (decisões pendentes), [proposta-rag.md](proposta-rag.md) (o RAG determinístico, já adotado, com as medições), [faq-scripts.md](faq-scripts.md) (ingestão).

---

## 2. Estado atual

### A base de FAQs

| | |
|---|---|
| Documentos | **2451**, todos ativos |
| Origem | 55 arquivos do Google Drive (pasta `FAQ VALIDADO`) + inserções pelo dashboard |
| Modelo de embedding | **`gemini-embedding-2`**, 3072 dimensões |
| Índice no Atlas | `vector_index_3072`, cosine, na collection `ministerio_saude.faq_medicamentos` |
| Texto embedado | `Assunto: … / Pergunta: … / Resposta: …` — o assunto entra no vetor |

### O fluxo do chatbot

Existe **um fluxo só**: o RAG determinístico, em [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json), na rota `/webhook/whatsapp`.

```
Webhook → Dados → Switch → Buscar FAQs → Montar contexto → AI Agent → Enviar resposta
                            (mode: load)     (Code)
```

- Chat: `gemini-3.1-flash-lite` (cota gratuita de 500/dia)
- Embeddings: `gemini-embedding-2` — **precisa ser o mesmo da base**
- `topK: 10`, `preFilter: {"isActive": true}`
- Memória: Redis db 0, janela de 4 mensagens, TTL 1h

### O dashboard

Repositório **separado**: `Dashboard-PetSaude/`, com git e remote próprios ([LucMazarJR/Dashboard-PetSaude](https://github.com/LucMazarJR/Dashboard-PetSaude)). O `.gitignore` da raiz o ignora de propósito.

- **back** — NestJS na porta 3333. FAQs no Mongo, identidade no Postgres
- **front** — TanStack Start na 5173 (a 3000 é do gateway)
- Login individual com JWT em cookie httpOnly, três papéis: `admin`, `editor`, `leitor`
- Paginação no servidor em todas as listagens

---

## 3. Subir tudo do zero

### 3.1 Infraestrutura

```powershell
docker compose up -d
docker compose ps
curl.exe http://localhost:3000/health/live
```

⚠️ Se o Postgres não subir com erro de *"socket forbidden"*, a porta 5432 está ocupada por uma instalação nativa. Troque `POSTGRES_HOST_PORT` no `.env` (ex.: `55432`) e ajuste o `DATABASE_URL` do dashboard.

### 3.2 Sessão do WhatsApp

As credenciais vivem no volume `wa_sessions` e sobrevivem a restart. Se precisar parear de novo:

1. **No celular: WhatsApp → Aparelhos conectados → desconectar todos.** Não é opcional — ver armadilha na seção 5
2. Pegue o QR: o ASCII **não** sai no log com `NODE_ENV=production`. Use o PNG:

```powershell
$KEY = ((Get-Content .env | Select-String '^GATEWAY_API_KEY=') -split '=',2)[1].Trim()
curl.exe -sS -f -H "X-Api-Key: $KEY" "http://localhost:3000/api/v1/sessions/default/qr?format=png" -o qr.png
if ($?) { (Get-Item qr.png).Length; start qr.png }
```

Alguns KB = QR real. ~200 bytes = JSON de erro com extensão `.png`.

3. Confirme que **sustenta** (espere ~30s):

```powershell
curl.exe -s -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/sessions/default
curl.exe -s -o nul -w "ready: HTTP %{http_code}" http://localhost:3000/health/ready
```

> ⚠️ **Nunca** use `DELETE /api/v1/sessions/default` — apaga as credenciais e exige QR novo.

### 3.3 Dashboard

```powershell
cd Dashboard-PetSaude/back
# copie .env.example para .env e preencha
pnpm install
pnpm run migration:run
pnpm run seed:admin      # usa ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD do .env
pnpm run start:dev
```

```powershell
cd Dashboard-PetSaude/front
# copie .env.example para .env (VITE_API_BASE_URL e SESSION_SECRET)
npx vite dev --port 5173
```

O seed é **idempotente**: se já houver usuário, ele não faz nada. A senha do admin é provisória — a troca é exigida no primeiro acesso.

### 3.4 Ingestão de novas FAQs

Só é necessária quando entram arquivos novos no Drive. A base atual já está completa.

```powershell
cd scripts
python enviar_dados.py
# quantos ficaram sem vetor:
python -c "import os;from dotenv import load_dotenv;from pymongo import MongoClient;load_dotenv();c=MongoClient(os.getenv('MONGODB_URI'))['ministerio_saude']['faq_medicamentos'];print('sem vetor:',c.count_documents({'embedding':None}))"
python gerar_embeddings.py   # repita até zerar
```

---

## 4. A regra que quebra tudo em silêncio

**O modelo de embedding precisa ser idêntico em três lugares.** Divergir não gera erro em lugar nenhum — a busca simplesmente devolve resultado ruim, ou a FAQ nunca aparece.

| Onde | Configuração |
|---|---|
| Ingestão | `GEMINI_EMBEDDING_MODEL` no `.env` da raiz → [lib/gemini_embendding.py](../scripts/lib/gemini_embendding.py) |
| Dashboard | `GEMINI_EMBEDDING_MODEL` no `Dashboard-PetSaude/back/.env` |
| n8n | nó `Embeddings Google Gemini` do fluxo |

Hoje os três estão em `gemini-embedding-2` com `SEMANTIC_SIMILARITY` e 3072 dimensões.

Trocar de modelo exige **reindexar as 2451 FAQs** ([reindexar_embeddings.py](../scripts/reindexar_embeddings.py)) e atualizar os três lugares. Não é uma troca de uma linha.

---

## 5. Armadilhas já descobertas

Cada uma custou tempo. Não repita.

**URI do Mongo sem nome de banco.** `mongodb+srv://...mongodb.net/?appName=x` faz o driver assumir `test` — e existe um `test.faq_medicamentos` com 2 documentos de lixo. A aplicação funciona, mostra 2 FAQs em vez de 2451, e não dá erro. Já derrubou o n8n e quase derrubou o dashboard.

**QR ASCII não sai no log em produção.** O [baileys.provider.ts:256](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts#L256) só desenha o ASCII `if (!this.config.isProduction)`.

**`curl --output` grava erro como imagem.** Um 401 vira um `qr.png` de 234 bytes que nenhum visualizador abre. Cheque o tamanho.

**Conflito de aparelhos apaga as credenciais.** Mais de uma sessão pendurada em "Aparelhos conectados" faz o WhatsApp derrubar uma com `Stream Errored (conflict)`. O gateway classifica como `loggedOut` e **apaga as credenciais**. Sintoma: `CONNECTED` seguido de "Sessão desvinculada" em menos de 1 segundo.

**LID: `phoneE164` e `pushName` vêm `null`.** O WhatsApp migrou para endereçamento LID (`...@lid`). Não quebra nada — responder para o `@lid` funciona.

**`N8N_BLOCK_ENV_ACCESS_IN_NODE` bloqueia `$env` nos nós.** Com ele ligado, o fluxo executa, o agente responde, gasta cota — e a resposta morre no nó HTTP, sem erro visível no gateway. O compose já define `false`.

**pnpm 11 recusa rodar scripts com builds pendentes.** Migrations, seed e build falham com `ERR_PNPM_IGNORED_BUILDS`, que não menciona nenhum dos três. A aprovação vive no `pnpm-workspace.yaml`.

**Credencial gravada pela tela do n8n pode não colar.** Aconteceu com o Header Auth: a tela salvava, e o webhook continuava devolvendo 403. O caminho confiável é o CLI:

```powershell
docker compose exec -T n8n n8n import:credentials --input=/tmp/cred.json
```

**Importar workflow pelo CLI o desativa.** O `import:workflow` respeita o campo `active` do JSON, e depois é preciso `publish:workflow` **e reiniciar o n8n** para a rota voltar a responder.

---

## 6. Como verificar que está tudo certo

Nenhum destes gasta cota do Gemini:

```powershell
# fluxo ativo e rota registrada (403 = existe e está protegida)
docker compose exec -T n8n n8n list:workflow --active=true
curl.exe -s -o nul -w "%{http_code}" -X POST http://localhost:5678/webhook/whatsapp

# modelos gravados no fluxo
docker compose exec -T n8n sh -c "n8n export:workflow --id=VsDU20sSLz8DRHqk --output=/tmp/v.json >/dev/null 2>&1; grep -o 'modelName\":\"[^\"]*\"' /tmp/v.json"

# para onde o gateway entrega
docker compose exec -T whatsapp-gateway printenv N8N_WEBHOOK_URL

# integridade da base
cd scripts; python -c "import os;from dotenv import load_dotenv;from pymongo import MongoClient;load_dotenv();c=MongoClient(os.getenv('MONGODB_URI'))['ministerio_saude']['faq_medicamentos'];print('total',c.count_documents({}),'| modelo 2:',c.count_documents({'embedding_model':'gemini-embedding-2'}),'| sem vetor:',c.count_documents({'embedding':None}))"
```

---

## 7. Dívidas técnicas abertas

| # | Dívida | Onde | Impacto |
|---|---|---|---|
| 1 | 🟡 `task_type` da busca no n8n não é controlado | nó Embeddings | A ingestão usa `SEMANTIC_SIMILARITY`; o nó usa o padrão dele. Alinhar exigiria reindexar as 2451 |

Resolvidas em 21/08/2026:

- ~~`limpar_banco.py` recriava o índice com 768 dimensões~~ — hoje usa 3072 e o
  nome certo, exige `--confirmo-apagar-tudo` **e** confirmação digitada, e
  aponta para o `backup_faqs.py` antes de apagar
- ~~O gateway logava o `X-Webhook-Token` em texto claro~~ — o log de falha de
  entrega passou a sair sanitizado (mensagem, código, status e URL)
- ~~Três variáveis do schema não chegavam ao container~~ — `N8N_WEBHOOK_TIMEOUT_MS`,
  `N8N_WEBHOOK_MAX_RETRIES` e `DEDUPE_TTL_SECONDS` agora são repassadas pelo compose
- ~~FAQs desativadas continuavam sendo recuperadas~~ — o fluxo usa
  `preFilter: {"isActive": true}`
- ~~O log da desvinculação não registrava o motivo~~ — agora sai com `statusCode`
  e a mensagem do erro, o que distingue desvinculação real de conflito de aparelhos
- ~~Envio não validava se o número existe~~ — número solto passa por
  `onWhatsApp()` e devolve 400 quando não há conta. JIDs vindos do webhook pulam
  a checagem

E uma descoberta de segurança em 21/08/2026: o range `^6.7.0` do
`@whiskeysockets/baileys` alcançava a versão **6.17.16**, que está
descontinuada por uma falha que permite **falsificação de mensagens**
([GHSA-qvv5-jq5g-4cgg](https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg)).
A armadilha é de semver: 6.17.16 é *maior* que 6.7.24, então o caret resolvia
justamente para a vulnerável. O lockfile segurava em 6.7.24, mas um
`npm install` sem lockfile traria a falha. O range foi fechado em `~6.7.24`.

---

## 8. Decisões que dependem de você

Detalhamento em [depende-de-voce.md](depende-de-voce.md).

| Decisão | Por que agora |
|---|---|
| **Billing do Gemini** | A cota gratuita de embeddings é de **1000/dia por projeto**. O fluxo determinístico gasta 1 embedding por mensagem, então esse é o teto diário de conversas. Reindexar exige 2451 chamadas |
| **Condensação de query** | "e quanto tempo?" busca com a frase crua e recupera lixo. A correção dobra as chamadas de LLM por mensagem — só vale se o teste mostrar que acontece com frequência |
| **Tier do MongoDB Atlas** | Se for M0, há limite de conexões simultâneas e de índices de busca |

Itens de prazo longo (número institucional, API oficial da Meta, hospedagem, LGPD das conversas) estão em [depende-de-voce.md](depende-de-voce.md#quando-sair-do-teste). A verificação da Meta leva semanas.
