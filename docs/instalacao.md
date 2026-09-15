# Instalação

Como subir tudo do zero, numa máquina nova. Para entender o que cada peça faz, ver [arquitetura.md](arquitetura.md). Quando algo der errado de um jeito estranho, ver [armadilhas.md](armadilhas.md) — quase tudo que quebra em silêncio está lá.

Ambiente de referência: Windows 11 + PowerShell + Docker Desktop. Em Linux ou macOS só mudam os comandos de shell.

---

## Pré-requisitos

- Docker e Docker Compose
- Cluster MongoDB Atlas, com a base de FAQs (ver [base-de-faqs.md](base-de-faqs.md))
- Chave de API do Google Gemini
- Túnel do Cloudflare com token, se o webhook do n8n precisar ser alcançável de fora
- Um celular com WhatsApp para parear
- Node **não é necessário** para o chatbot — o build acontece dentro do container. Só é preciso para rodar o dashboard fora do Docker

---

## 1. O `.env`

```powershell
cp .env.example .env
```

Gere cada segredo **distinto**:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Preencha `GATEWAY_API_KEY`, `N8N_WEBHOOK_TOKEN`, `N8N_WEBHOOK_SECRET`, `REDIS_PASSWORD` e `POSTGRES_PASSWORD`, mais o token e a URL do Cloudflare, a `MONGODB_URI` e a `GEMINI_API_KEY`.

> ⚠️ **A `MONGODB_URI` precisa ter o nome do banco no caminho** — `…/ministerio_saude?appName=…`, não `…/?appName=…`. Sem isso o driver assume `test`, e existe um `test.faq_medicamentos` com dois documentos de lixo nesse cluster. Tudo sobe, conecta e simplesmente não encontra as FAQs reais, sem erro nenhum. Já mordeu o n8n e o dashboard, em ocasiões separadas.

O gateway valida a configuração no boot e **recusa subir** com valor faltando ou com menos de 16 caracteres — a mensagem diz qual campo corrigir.

---

## 2. Subir os containers

```powershell
docker compose up -d --build
docker compose ps
curl.exe http://localhost:3000/health/live
```

Se o Postgres não subir com erro de *"socket forbidden"*, a porta 5432 do host está ocupada por uma instalação nativa — a mensagem não deixa isso óbvio. Troque `POSTGRES_HOST_PORT` no `.env` (ex.: `55432`).

---

## 3. Parear o WhatsApp

O gateway inicia a sessão sozinho e gera o QR code.

> ⚠️ **Antes de escanear, desconecte todos os aparelhos** em WhatsApp → Configurações → Aparelhos conectados. Com mais de uma sessão pendurada, o WhatsApp derruba uma com `Stream Errored (conflict)`, o gateway classifica isso como `loggedOut` e **apaga as credenciais**. Sintoma: `CONNECTED` seguido de "Sessão desvinculada" em menos de um segundo.

O ASCII do QR **não sai no log em produção** — baixe o PNG:

```powershell
$KEY = ((Get-Content .env | Select-String '^GATEWAY_API_KEY=') -split '=',2)[1].Trim()
curl.exe -sS -f -H "X-Api-Key: $KEY" "http://localhost:3000/api/v1/sessions/default/qr?format=png" -o qr.png
if ($?) { (Get-Item qr.png).Length; start qr.png }
```

Alguns KB = QR real. ~200 bytes = um JSON de erro com extensão `.png`, que nenhum visualizador abre — **confira o tamanho** antes de tentar.

No celular: **Configurações → Aparelhos conectados → Conectar um aparelho**, e escaneie.

Confirme que a conexão **sustenta** — espere uns 30s, não basta ver `CONNECTED` uma vez:

```powershell
curl.exe -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/sessions/default
curl.exe -s -o nul -w "ready: HTTP %{http_code}" http://localhost:3000/health/ready
```

Quer `"status":"CONNECTED"` e `ready: HTTP 200`. A sessão fica no volume `wa_sessions` e sobrevive a restarts.

> ⚠️ **Nunca** use `DELETE /api/v1/sessions/default` — apaga as credenciais e exige QR novo.

---

## 4. Testar o envio, sem o n8n

Isola o gateway e prova que a parte mais crítica funciona:

```powershell
curl.exe -X POST http://localhost:3000/api/v1/messages `
  -H "X-Api-Key: <GATEWAY_API_KEY>" `
  -H "Content-Type: application/json" `
  -d '{\"to\":\"5516999998888\",\"text\":\"Teste do gateway\"}'
```

A mensagem chega em alguns segundos — o atraso é a fila anti-ban.

---

## 5. Credenciais e fluxo no n8n

Em `http://localhost:5678`, cadastre:

| Credencial | Valores |
|---|---|
| **Redis** | host `redis`, porta `6379`, senha = `REDIS_PASSWORD`, **database `0`** |
| **MongoDB** | a connection string do Atlas |
| **Google Gemini** | a chave de API |
| **Header Auth** | nome `Gateway Webhook Token` · Name: `X-Webhook-Token` · Value: o `N8N_WEBHOOK_TOKEN` do `.env` |

Depois: **Workflows → Import from File** → [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json), vincule as credenciais (os nós vêm marcados), confirme que **Redis Chat Memory** está ligado ao **AI Agent**, e **ative** o workflow.

Duas coisas que já custaram tempo aqui — a credencial salva pela tela nem sempre cola, e importar pelo CLI desativa o fluxo. Ver [armadilhas.md](armadilhas.md#n8n).

---

## 6. Dashboard de FAQs

Opcional para o chatbot funcionar, mas é como a equipe gerencia o conteúdo sem mexer no banco na mão.

**No compose** — sobe junto com o resto:

```powershell
# no .env: COMPOSE_PROFILES=dashboard
docker compose up -d
# API em 127.0.0.1:3333, painel em 127.0.0.1:5173
```

As migrations do Postgres rodam sozinhas no boot (`DB_RUN_MIGRATIONS=true`). Crie o primeiro administrador, uma vez:

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

> ⚠️ As duas formas disputam as portas 3333 e 5173. Pare o container antes de rodar `pnpm start:dev`, ou vice-versa.

O seed é **idempotente**: se já houver usuário, não faz nada. A senha do admin é provisória — a troca é exigida no primeiro acesso.

---

## 7. Protótipo PWA

Opcional, e usado para validar a qualidade das respostas com participantes. Sobe com o mesmo compose e tem fluxo, token e credencial próprios — passo a passo em [prototipo-pwa.md](prototipo-pwa.md).

---

## 8. Testar de ponta a ponta

Mande uma mensagem de outro celular. Acompanhe em **n8n → Executions** e nos logs:

```powershell
docker compose logs -f whatsapp-gateway
```

Cada mensagem gera um `correlationId` que aparece em todas as linhas daquele atendimento.

Roteiro mínimo:

| # | O que mandar | O que precisa acontecer |
|---|---|---|
| 1 | `oi` | Saudação cordial — **não** pode cair no "não encontrei" |
| 2 | Uma pergunta que existe na base | Resposta correta. Na execução, `Buscar FAQs` mostra documentos recuperados **antes** do agente |
| 3 | Uma pergunta fora do escopo | Admite que não sabe, sem inventar e sem citar trecho de outro assunto |
| 4 | **Três perguntas seguidas sobre assuntos diferentes** | As três respostas precisam ser **diferentes entre si**. É o teste do "bot viciado" |
| 5 | Qualquer pergunta | **Uma única mensagem** de volta. Mais de uma significa que a agregação do nó Code falhou |
| 6 | Um áudio | Cai no aviso de somente texto, sem gastar cota |

---

## Checklist

- [ ] `.env` com os segredos gerados e `MONGODB_URI` com o nome do banco no caminho
- [ ] `docker compose ps` com todos os serviços saudáveis
- [ ] Sessão em `CONNECTED`, sustentando depois de 30s
- [ ] Envio direto pela API funcionou (passo 4)
- [ ] Credenciais cadastradas no n8n, fluxo importado e **ativo**
- [ ] Mensagem de teste respondida com formatação correta (sem tags `<b>`)
- [ ] Três perguntas seguidas sobre assuntos diferentes deram três respostas diferentes
- [ ] (Se o dashboard subiu) login funciona, e uma FAQ criada lá aparece na busca do bot

---

## Verificar sem gastar cota

Nenhum destes comandos chama o Gemini:

```powershell
# fluxo ativo e rota registrada (403 = existe e está protegida)
docker compose exec -T n8n n8n list:workflow --active=true
curl.exe -s -o nul -w "%{http_code}" -X POST http://localhost:5678/webhook/whatsapp

# para onde o gateway entrega
docker compose exec -T whatsapp-gateway printenv N8N_WEBHOOK_URL

# integridade da base
cd scripts
python -c "import os;from dotenv import load_dotenv;from pymongo import MongoClient;load_dotenv();c=MongoClient(os.getenv('MONGODB_URI'))['ministerio_saude']['faq_medicamentos'];print('total',c.count_documents({}),'| modelo 2:',c.count_documents({'embedding_model':'gemini-embedding-2'}),'| sem vetor:',c.count_documents({'embedding':None}))"
```
