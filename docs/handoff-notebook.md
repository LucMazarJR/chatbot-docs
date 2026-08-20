# Handoff — continuar o projeto em outra máquina

> **Como usar:** clone o repositório no notebook, abra o Claude Code na pasta do projeto e cole:
>
> *"Leia `docs/handoff-notebook.md`. Estou retomando este projeto numa máquina nova, do zero. Me guie a partir da seção 'Passo a passo no notebook'. Modo mentor: me explique o caminho e deixe eu executar, não implemente por mim."*
>
> Última sessão: 12/08/2026. Máquina anterior: Windows 11 + PowerShell 5.1 + Docker Desktop.

---

## 1. O projeto em um minuto

Chatbot de saúde no WhatsApp do **PET-SAÚDE** (Programa de Educação pelo Trabalho para a Saúde — "PET" é o programa, não animal de estimação). Responde dúvidas de cidadãos sobre exames, medicamentos, unidades e procedimentos, a partir de uma base de FAQs.

**Situação:** fase de teste interna. O grupo testa antes de qualquer atendimento real.

**Arquitetura:**

```
WhatsApp ──> whatsapp-gateway (NestJS + Baileys) ──webhook──> n8n ──> AI Agent (Gemini)
                    ▲                                                      │
                    └──────── POST /api/v1/messages ───────────────────────┘
                                                                    MongoDB Atlas (RAG)
                                                                    Redis (memória)
```

O gateway é um backend próprio que **substituiu o WAHA**. Ele isola o Baileys atrás da porta `WhatsAppProvider`, entrega ao n8n um envelope canônico estável, e aplica política anti-ban (atraso aleatório, "digitando" simulado, teto por minuto).

Serviços no `docker-compose.yml`: `whatsapp-gateway`, `n8n`, `redis`, `cloudflared`.

Documentação de referência: [chatbot.md](chatbot.md) (arquitetura + setup), [depende-de-voce.md](depende-de-voce.md) (pendências), [proposta-rag.md](proposta-rag.md) (proposta de RAG determinístico).

---

## 2. O que já foi validado e funciona

Tudo abaixo foi testado de verdade na máquina anterior, com evidência em log. Não precisa reinvestigar — só reconfirmar depois de subir.

| Camada | O que foi provado |
|---|---|
| **Config** | Fail-fast do `env.schema.ts` — a aplicação recusa subir com segredo faltando ou URL malformada |
| **Boot** | `/health/live` público (fora do prefixo `/api/v1`); `/health/ready` devolve 503 sem sessão e 200 com sessão + Redis |
| **Auth** | Guard global de `X-Api-Key`: 401 sem header, 200 com. O header aparece `[REDACTED]` no log |
| **Pareamento** | Sessão `CONNECTED`, número `+5516992286134`. Credenciais persistidas em `wa_sessions` — restart não pede QR |
| **Envio** | `POST /api/v1/messages` devolve `messageId` real. "Digitando..." aparece no celular antes da mensagem (fila anti-ban funcionando) |
| **Recepção** | Envelope canônico montado corretamente. **O texto da mensagem nunca vai pro log** — só `textLength` |
| **Dedupe** | `Mensagem duplicada descartada` aconteceu na prática, sem forçar — o Redis (db 1) pegou uma reentrega do WhatsApp |
| **Ciclo fechado** | Enviar de volta usando o `chatId` recebido (`2353725993202@lid`) **funciona** — a mensagem chegou |
| **Retry** | Backoff exponencial visto ao vivo (500→1000→2000ms) quando o n8n devolvia 404 |
| **Base RAG** | Índice `vector_index_3072` criado no Atlas, 3072 dimensões, cosine, na collection `faq_medicamentos` com ~1000 documentos com `embedding` populado |

**Não testado ainda:** formatação HTML→WhatsApp, idempotência via `idempotencyKey`, rejeição 400 de campo desconhecido, e **toda a integração com o n8n** (credenciais, importar fluxo, ativar, roteiro de conteúdo).

---

## 3. O que NÃO sobrevive à troca de máquina

Os volumes Docker ficam na máquina antiga. No notebook você recomeça:

| Volume | Conteúdo | Consequência |
|---|---|---|
| `wa_sessions` | Credenciais do WhatsApp | **Precisa parear de novo** (QR novo) |
| `n8n_data` | Fluxos e credenciais do n8n | Recadastrar as 4 credenciais e reimportar o fluxo (o JSON está no repo) |
| `redis_data` | Memória de conversa + dedupe | Irrelevante, se reconstrói sozinho |

**Persiste na nuvem, não se perde:** o MongoDB Atlas com o índice `vector_index_3072` e os ~1000 documentos com embeddings. Essa foi a parte mais trabalhosa e ela **já está pronta** — não precisa rodar `enviar_dados.py` de novo.

**Leve à mão:** o arquivo `.env` da raiz (não é versionado). Ele tem os 4 segredos gerados e os valores do Cloudflare. Não leve o `.env.bak.waha` — é backup da configuração antiga do WAHA, é lixo.

---

## 4. Passo a passo no notebook

### 0. Antes de sair da máquina antiga

```powershell
git add .env.example .gitignore docs/handoff-notebook.md
git commit -m "docs: handoff + env vars faltantes no example"
git push
```

Sem isso, este documento e as correções não chegam no notebook. E copie o `.env` para um lugar seguro (pendrive, gerenciador de senhas — **não** por e-mail ou chat).

### 1. Preparar o ambiente

- Docker Desktop instalado **e rodando** (o daemon precisa estar ativo, não só instalado)
- `git clone` do repositório
- Colocar o `.env` na raiz do projeto
- Node **não é necessário** — o build acontece dentro do container. Só instale (v22) se quiser rodar `npm test` localmente; o CI já roda lint, typecheck, unitários e e2e a cada push

### 2. Validar a configuração antes de subir

```powershell
docker compose config --quiet
```

Silêncio = passou. Se faltar variável obrigatória, o compose reclama aqui em 1 segundo, em vez de você descobrir com container reiniciando em loop.

### 3. Subir

```powershell
docker compose up -d --build
docker compose ps
curl.exe http://localhost:3000/health/live
```

### 4. ⚠️ Antes de parear: limpar os aparelhos conectados

No celular: **WhatsApp → Configurações → Aparelhos conectados → desconectar todos.**

Isso não é opcional. Na sessão anterior, aparelhos antigos pendurados causaram um `Stream Errored (conflict)` que derrubou a sessão **93 milissegundos depois de conectar** — e o gateway apagou as credenciais automaticamente. Ver a seção 5.

### 5. Parear

O QR **não aparece desenhado no log** com `NODE_ENV=production` (que é o padrão do compose). Duas opções:

**Opção A — QR no terminal (mais confortável):** troque `NODE_ENV: production` por `development` no [docker-compose.yml](../docker-compose.yml), suba de novo, e o QR sai em ASCII, redesenhando sozinho a cada renovação:
```powershell
docker compose up -d whatsapp-gateway
docker compose logs -f whatsapp-gateway
```
Esse flag só afeta duas coisas: o QR ASCII e o `pino-pretty` (log legível). Nada de segurança ou comportamento. **Volte para `production` depois de parear.**

**Opção B — PNG:**
```powershell
$KEY = ((Get-Content .env | Select-String '^GATEWAY_API_KEY=') -split '=',2)[1].Trim()
curl.exe -sS -f -H "X-Api-Key: $KEY" "http://localhost:3000/api/v1/sessions/default/qr?format=png" -o qr.png
if ($?) { (Get-Item qr.png).Length; start qr.png }
```
Se o arquivo tiver ~200 bytes, é JSON de erro com extensão `.png`, não imagem. QR real tem alguns KB.

O QR expira em segundos — tenha o celular na mão antes.

### 6. Confirmar que a conexão *sustenta*

Não basta ver `CONNECTED` uma vez. Espere ~30 segundos e cheque:

```powershell
curl.exe -s -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/sessions/default
curl.exe -s -o nul -w "ready: HTTP %{http_code}" http://localhost:3000/health/ready
```

Quer `"status":"CONNECTED"` **e** `ready: HTTP 200`.

### 7. Revalidar envio e recepção (rápido)

Helper para PowerShell — o `GetBytes` evita que acento vire `jejum`:

```powershell
function Send-Wa($to, $text, $extra = @{}) {
  $KEY = ((Get-Content .env | Select-String '^GATEWAY_API_KEY=') -split '=',2)[1].Trim()
  $json = (@{ to = $to; text = $text } + $extra) | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/messages' -Method Post `
    -Headers @{ 'X-Api-Key' = $KEY } -ContentType 'application/json; charset=utf-8' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
}
```

| Teste | Comando | Esperado |
|---|---|---|
| Envio | `Send-Wa '55DDNUMERO' 'Teste'` | `status: sent`, mensagem chega |
| Formatação | `Send-Wa '55DDNUMERO' '**negrito** e <b>tag</b> e # Titulo'` | Chega `*negrito*`, `*tag*`, `*Titulo*` — **nenhuma tag literal** |
| Idempotência | Mesmo comando 2× com `@{ idempotencyKey = 'teste-1' }` | 2ª volta `status: duplicate`, sem mensagem nova |
| Contrato | `Send-Wa '55DDNUMERO' 'oi' @{ foo = 'bar' }` | **400** |
| Recepção | Mandar mensagem de outro celular | Log com `Mensagem recebida` e `textLength` (sem o texto) |

> ⚠️ **Nunca** use `DELETE /api/v1/sessions/default` — apaga as credenciais e exige QR novo.

### 8. Camada 7 — n8n (é aqui que a sessão anterior parou)

Pegue os segredos:
```powershell
((Get-Content .env | Select-String '^N8N_WEBHOOK_TOKEN=') -split '=',2)[1].Trim()
((Get-Content .env | Select-String '^REDIS_PASSWORD=') -split '=',2)[1].Trim()
```

Em `http://localhost:5678`, cadastre 4 credenciais:

| Credencial | Valores |
|---|---|
| **Header Auth** | Name: `X-Webhook-Token` · Value: o `N8N_WEBHOOK_TOKEN` |
| **Redis** | host `redis` · porta `6379` · senha do `.env` · **database `0`** |
| **MongoDB** | connection string do Atlas |
| **Google Gemini** | chave de API |

> O **db 0** importa: o gateway usa o **db 1** para o dedupe. Mesmo db faz a memória de conversa e a deduplicação se atropelarem.

Depois: **Workflows → Import from File** → [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json). Vincule as credenciais, confirme que **Redis Chat Memory** está ligado ao **AI Agent**, confirme `vectorIndexName: vector_index_3072` e collection `faq_medicamentos` no nó do Vector Store, e **ative** o workflow.

Os nós HTTP usam `{{ $env.GATEWAY_URL }}` e `{{ $env.GATEWAY_API_KEY }}` — o compose já injeta as duas no container do n8n.

### 9. Primeiro teste: "oi"

Mande **"oi"** de outro celular. A saudação está no system prompt e **não passa pelo vector store**, então isola fluxo/credenciais do RAG:

- **Respondeu** → webhook + Header Auth + agente + Gemini + resposta pelo `@lid`: tudo de pé
- **Não respondeu** → problema é fluxo ou credencial; nem olhe pro Mongo ainda

```powershell
docker compose logs --tail 30 whatsapp-gateway | Select-String 'Evento entregue ao n8n|NÃO entregue'
```
Quer ver `Evento entregue ao n8n`. Se aparecer **404**, o workflow não está ativo. Se **401**, o Header Auth está com nome ou valor errado.

### 10. Roteiro de conteúdo

| # | Mandar | Esperado |
|---|---|---|
| 1 | Pergunta que existe na base | Resposta correta, sem tag HTML |
| 2 | Pergunta fora do escopo | "não encontrei essa informação..." |
| 3 | **3 perguntas seguidas sobre exames diferentes** | As 3 respostas **diferentes entre si** |
| 4 | Qualquer pergunta | **Uma única** mensagem de volta |
| 5 | Áudio ou foto | Aviso de "somente texto" |

O **teste 3** é o mais importante: é o único que valida a hipótese central da [proposta-rag.md](proposta-rag.md) (o "bot viciado") contra a base real.

No teste 1, abra a execução no n8n e veja **se o nó do Vector Store foi realmente chamado**. Ele está em `mode: retrieve-as-tool` — quem decide chamar é o agente, e ele nem sempre chama. Isso é o problema nº 1 da proposta acontecendo ao vivo.

---

## 5. Armadilhas já descobertas

Cada uma dessas custou tempo na sessão anterior. Não repita.

**QR ASCII não sai no log em produção.** O [baileys.provider.ts:256](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts#L256) só desenha o ASCII `if (!this.config.isProduction)`, e o compose fixa `NODE_ENV: production`. O [chatbot.md:201-204](chatbot.md#L201-L204) promete o contrário — **a documentação está errada nesse ponto.**

**`curl --output` grava erro como imagem.** Um 401 vira um `qr.png` de 234 bytes com JSON dentro, que nenhum visualizador abre. Sempre cheque o tamanho.

**Conflito de aparelhos apaga as credenciais.** Se houver mais de uma sessão pendurada em "Aparelhos conectados", o WhatsApp derruba uma com `Stream Errored (conflict)`. O gateway classifica isso como `loggedOut`, chama `authState.clear()` e **apaga as credenciais** ([baileys.provider.ts:301-307](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts#L301-L307)). Sintoma: `CONNECTED` seguido de "Sessão desvinculada" em menos de 1 segundo.

**LID: `phoneE164` e `pushName` vêm `null`.** O WhatsApp migrou para endereçamento LID (`...@lid`) e o número real não vem mais no evento. O mapper já previu isso (`pickPhoneJid` procura em `remoteJidAlt`), mas o Baileys não manda o campo. **Isso não quebra o fluxo** — foi verificado que o n8n não usa nenhum dos dois. E enviar de volta para um `@lid` funciona.

**PowerShell 5.1 e acentos.** `Invoke-RestMethod` com `-Body` string manda em ANSI; acento vira mojibake no celular. Use `[System.Text.Encoding]::UTF8.GetBytes($json)`.

**A função `Send-Wa` some ao fechar o terminal.** Ela vive só na sessão do PowerShell onde foi colada, e lê o `.env` por caminho relativo — precisa estar em `c:\projetos\chatbot`.

---

## 6. Dívidas técnicas abertas

Nenhuma bloqueia o teste. Todas foram descobertas na sessão anterior e ainda **não foram corrigidas**.

| # | Dívida | Onde | Impacto |
|---|---|---|---|
| 1 | 🔴 `limpar_banco.py` recria o índice com **768** dimensões, incompatível com os vetores de 3072 | [limpar_banco.py:34](../scripts/limpar_banco.py#L34) | Rodar o script quebra a busca **em silêncio**. **Não rode.** |
| 2 | 🟠 Nome do índice divergente: o n8n consulta `vector_index_3072`, os scripts criam `vector_index` | [enviar_dados.py:105](../scripts/enviar_dados.py#L105) | Recriar o ambiente do zero exige criar o índice à mão. Foi o que aconteceu |
| 3 | 🟡 Três variáveis do schema não são repassadas ao container | [docker-compose.yml:24-49](../docker-compose.yml#L24-L49) | `N8N_WEBHOOK_TIMEOUT_MS`, `N8N_WEBHOOK_MAX_RETRIES` e `DEDUPE_TTL_SECONDS` no `.env` não têm efeito — valem os defaults |
| 4 | 🟡 O log da desvinculação não registra o motivo | [baileys.provider.ts:304](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts#L304) | O evento mais destrutivo do sistema (apaga credenciais) não diz por que aconteceu. Loga só `{ sessionId }` |
| 5 | 🟡 Envio não valida se o número existe no WhatsApp | [outbound.service.ts](../backend/src/outbound/outbound.service.ts) | Número malformado devolve `messageId` normalmente e a mensagem some. O Baileys tem `onWhatsApp()` para checar |
| 6 | 🟡 Documentação do QR incorreta | [chatbot.md:201-204](chatbot.md#L201-L204) | Ver seção 5 |

Sugestão: resolver 1 e 2 juntos, num commit só, depois que o bot estiver respondendo.

---

## 7. Decisões que dependem de você

Detalhamento completo em [depende-de-voce.md](depende-de-voce.md).

| Decisão | Por que agora |
|---|---|
| **Nome canônico do índice vetorial** | A plataforma de gestão de FAQs que o grupo está construindo vai precisar criar e consultar esse índice. Fixar o nome agora evita que ela nasça com a mesma divergência |
| **Cota / billing do Gemini** | O modelo é `gemini-2.5-flash-lite` na cota gratuita. Com o grupo inteiro testando, ela acaba — e o bot simplesmente para de responder. A credencial cadastrada no n8n é a chave pessoal de outra pessoa ("Felipe Gemini") |
| **Tier do MongoDB Atlas** | Se for M0 (gratuito), há limite de conexões simultâneas |

Itens de prazo longo (número institucional, API oficial da Meta, hospedagem em VPS, LGPD das conversas) estão em [depende-de-voce.md](depende-de-voce.md#quando-sair-do-teste) — nenhum bloqueia o teste, mas a verificação da Meta leva semanas.

---

## 8. Alterações feitas na sessão anterior

Commitadas (ou a commitar antes de migrar):

- **`.env.example`** — documentadas 3 variáveis que existiam no `env.schema.ts` mas não no exemplo, com a nota de que o compose ainda não as repassa; e a nota sobre apontar `N8N_WEBHOOK_URL` para o fluxo RAG
- **`.gitignore`** — `.env.*` com exceção `!.env.example`. Antes, um backup `.env.bak.waha` ficava como untracked e podia ir para o commit com segredo dentro

Não versionado:

- **`.env`** — reescrito por completo. O anterior ainda era da era WAHA (`WAHA_API_KEY`, `WHATSAPP_SWAGGER_*`) e não tinha nenhuma variável nova, então `docker compose up` falharia de imediato. Os 4 segredos foram gerados novos e os valores do Cloudflare preservados
