# PET-BOT — Chatbot de Atendimento via WhatsApp

Chatbot de saúde animal que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o modelo Gemini. Toda a infraestrutura roda localmente via Docker; a inteligência do fluxo vive no n8n.

---

## Parte 1 — Como funciona atualmente

### Infraestrutura (Docker)

| Serviço | Imagem | Porta | Função |
|---|---|---|---|
| n8n | n8nio/n8n | 5678 | Orquestra todo o fluxo de automação |
| WAHA | devlikeapro/waha:noweb | 3000 | Ponte entre o WhatsApp e o n8n |
| Redis | redis | 6379 | Memória de curto prazo das conversas |
| cloudflared | cloudflare/cloudflared | — | Expõe o webhook do n8n para a internet |

Volumes persistentes: `n8n_data` (fluxos e credenciais do n8n) e `waha_data` montado em `/app/.sessions` (sessão do WhatsApp — evita escanear QR a cada reinício).

---

### Fluxo de mensagens no n8n

```
Webhook → Filter → Dados → Switch → AI Agent → HTTP Request (WAHA)
                                  ↘ Fallback (mídia/limite)
```

**1. Webhook**
Recebe eventos do WAHA no caminho `/webhook/whatsapp`. URL pública exposta pelo Cloudflare Tunnel.

**2. Filter**
Descarta eventos que não sejam do tipo `message` (ex: `session.status`). Condição: `body.event == "message"`.

**3. Dados**
Normaliza os campos do payload do WAHA para nomes simples usados pelo restante do fluxo:

| Campo | Origem no payload WAHA |
|---|---|
| `IdChat` | `body.payload._data.key.remoteJidAlt` |
| `TextoMensagem` | `body.payload.body` |
| `NomeUser` | `body.payload._data.pushName` |
| `IdMsg` | `body.payload.id` |

**4. Switch**
Verifica se `TextoMensagem` existe.
- Existe → segue para o AI Agent
- Não existe (áudio, imagem, sticker) → Fallback informa que o bot só aceita texto

**5. Redis Chat Memory**
Mantém contexto da conversa usando `IdChat` como chave. Janela de 10 mensagens, TTL de 1 hora. Conversas diferentes nunca se misturam.

**6. AI Agent (Google Gemini)**
Núcleo inteligente do bot. Instruções principais no `systemMessage`:
- Responde apenas sobre saúde, bem-estar e assuntos da base de FAQs
- Busca primeiro no MongoDB Atlas Vector Store antes de formatar qualquer resposta
- Não inventa informações fora da base
- Tom cordial, claro e direto em PT-BR
- Em emergências, orienta atendimento imediato

**7. MongoDB Atlas Vector Store**
Ferramenta do agente. Consulta a coleção `faq_medicamentos` com o índice `vector_index_3072` usando embeddings do Google Gemini. Permite encontrar perguntas parecidas mesmo com palavras diferentes.

**8. HTTP Request → WAHA**
Envia a resposta ao endpoint `http://waha:3000/api/sendText` com:
```json
{
  "session": "default",
  "chatId": "<IdChat>",
  "text": "<resposta do agente>"
}
```
Header obrigatório: `X-Api-Key: <WAHA_API_KEY>`

---

### Variáveis de ambiente (.env)

```env
CLOUDFLARE_TUNNEL_TOKEN=<token do tunnel>
CLOUDFLARE_URL=<URL pública, ex: https://petbot.lucianomjr.dev>
WAHA_API_KEY=<chave gerada — usada na API e no dashboard>
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<gerado pelo WAHA no primeiro boot>
WHATSAPP_SWAGGER_USERNAME=admin
WHATSAPP_SWAGGER_PASSWORD=<mesmo valor do dashboard>
```

---

### Dependências externas

- **MongoDB Atlas** — base vetorial de FAQs
- **Google Gemini API** — modelo de chat e embeddings
- **Cloudflare Tunnel** — exposição pública do webhook

Se a máquina local parar, o bot para junto. Se MongoDB ou Gemini caírem, o ambiente sobe mas o bot perde a capacidade de responder.

---

## Parte 2 — Como reimplementar do zero

Siga esta ordem. Cada etapa depende da anterior.

### Pré-requisitos

- Docker e Docker Compose instalados
- Conta no MongoDB Atlas com cluster e índice vetorial configurados
- Chave de API do Google Gemini
- Tunnel do Cloudflare criado e com token disponível

---

### Passo 1 — Criar o .env

Crie o arquivo `.env` na raiz do projeto com todas as variáveis. Para gerar senhas seguras no PowerShell:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Preencha com:
```env
CLOUDFLARE_TUNNEL_TOKEN=<token do tunnel>
CLOUDFLARE_URL=<URL pública do tunnel>
WAHA_API_KEY=<chave gerada>
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<senha gerada>
WHATSAPP_SWAGGER_USERNAME=admin
WHATSAPP_SWAGGER_PASSWORD=<mesma senha do dashboard>
```

> Se deixar `WAHA_DASHBOARD_PASSWORD` em branco no primeiro boot, o WAHA gera uma senha aleatória e exibe nos logs. Copie e cole no `.env` antes de reiniciar.

---

### Passo 2 — Subir os containers

```powershell
docker compose up -d
```

Confirme que todos estão `Up`:
```powershell
docker compose ps
```

---

### Passo 3 — Conectar o WhatsApp ao WAHA

1. Acesse `http://localhost:3000/dashboard`
2. Login: `admin` / `<WAHA_DASHBOARD_PASSWORD>`
3. Crie uma sessão com o nome `default`
4. Escaneie o QR code com o WhatsApp em **Configurações → Aparelhos conectados → Conectar um aparelho**
5. Aguarde o status mudar para `WORKING`

A sessão fica salva no volume `waha_data`. Não será necessário escanear novamente a menos que o volume seja deletado ou o WhatsApp desconecte o aparelho.

---

### Passo 4 — Configurar credenciais no n8n

Acesse `http://localhost:5678` e cadastre as credenciais:

- **Redis** — host `redis`, porta `6379`, senha `default`
- **MongoDB** — connection string do Atlas
- **Google Gemini** — chave de API

---

### Passo 5 — Importar o fluxo no n8n

1. No n8n, vá em **Workflows → Import from file**
2. Importe o arquivo `My workflow 2.json`
3. Abra o fluxo e verifique se todos os nós estão com as credenciais vinculadas (sem ícone de erro vermelho)

---

### Passo 6 — Configurar o webhook no WAHA

No dashboard do WAHA, abra a sessão `default` e adicione um webhook:

- **URL**: `<CLOUDFLARE_URL>/webhook/whatsapp` (ex: `https://petbot.lucianomjr.dev/webhook/whatsapp`)
- **Events**: `message` e `session.status`

Salve.

---

### Passo 7 — Ativar o workflow no n8n

Abra o fluxo importado e clique no toggle de ativação no canto superior direito. O status deve mudar para **Active**.

---

### Passo 8 — Testar

Envie uma mensagem de WhatsApp para o número conectado a partir de outro celular. O fluxo deve:

1. Receber o evento no webhook
2. Filtrar e normalizar os dados
3. Consultar o agente de IA
4. Retornar a resposta pelo WAHA

Acompanhe as execuções em **n8n → Executions**.

---

### Checklist de reimplementação

- [ ] `.env` criado com todas as variáveis
- [ ] Containers rodando (`docker compose ps`)
- [ ] WhatsApp conectado ao WAHA (status `WORKING`)
- [ ] Credenciais cadastradas no n8n
- [ ] Fluxo importado e sem erros de credencial
- [ ] Webhook configurado no WAHA apontando para a URL de produção
- [ ] Workflow ativado no n8n
- [ ] Teste de mensagem recebido e respondido
