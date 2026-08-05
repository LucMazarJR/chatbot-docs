# Chatbot de Atendimento via WhatsApp

Chatbot que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o modelo Gemini.

Projeto do **PET-SAÚDE** — Programa de Educação pelo Trabalho para a Saúde, do Ministério da Saúde, em que grupos de estudantes desenvolvem projetos aplicados. O domínio é saúde humana e serviços públicos de saúde. O grupo já rodou uma versão em n8n + Telegram; a migração para o WhatsApp é por alcance e escalabilidade. **Fase atual: teste interno** — ver [docs/depende-de-voce.md](docs/depende-de-voce.md).

Duas peças, responsabilidades separadas:

- **[backend/](backend/)** — gateway próprio de WhatsApp em NestJS. Dono do canal: conexão, sessão, deduplicação, política anti-ban e formatação. **Substitui o WAHA.**
- **[n8n/](n8n/)** — dono da inteligência: agente Gemini, busca vetorial e memória da conversa.

## Estrutura

```
chatbot-docs/
├── docker-compose.yml         # gateway, n8n, redis, cloudflared
├── .env.example               # modelo das variáveis
├── backend/                   # whatsapp-gateway (NestJS)
│   ├── src/
│   │   ├── channels/whatsapp/ # porta + adapter Baileys
│   │   ├── sessions/          # ciclo de vida, QR, status
│   │   ├── inbound/           # normalização e deduplicação
│   │   ├── outbound/          # envio, fila anti-ban, formatação
│   │   ├── webhooks/          # entrega assinada ao n8n
│   │   └── health/
│   └── README.md              # arquitetura e API do gateway
├── docs/
│   ├── chatbot.md             # arquitetura e guia de instalação
│   ├── depende-de-voce.md     # como rodar agora + o que preparar para depois
│   ├── proposta-rag.md        # proposta de RAG determinístico (para discussão)
│   └── faq-scripts.md         # scripts de ingestão de FAQs
├── n8n/
│   ├── whatsapp-chatbot.json  # fluxo atual
│   ├── whatsapp-chatbot-rag-deterministico.json  # proposta de RAG (não ativo)
│   └── Whatsaap PET-BOT.json  # fluxo antigo (WAHA) — mantido para rollback
└── scripts/                   # ingestão de FAQs: Drive → embeddings → MongoDB
```

## Início rápido

```powershell
# 1. Copie o .env e gere os quatro segredos
cp .env.example .env
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# 2. Suba tudo
docker compose up -d --build

# 3. Pareie o WhatsApp (o QR aparece no log)
docker compose logs -f whatsapp-gateway

# 4. Importe o fluxo no n8n: http://localhost:5678
#    Arquivo: n8n/whatsapp-chatbot.json
```

O guia completo está em [docs/chatbot.md](docs/chatbot.md).

## Documentação

| Documento | Para quê |
|---|---|
| [docs/chatbot.md](docs/chatbot.md) | Como funciona e como instalar do zero |
| [docs/depende-de-voce.md](docs/depende-de-voce.md) | **Decisões e providências que só você/a prefeitura pode resolver** |
| [backend/README.md](backend/README.md) | Arquitetura do gateway e referência da API |
| [docs/faq-scripts.md](docs/faq-scripts.md) | Scripts de ingestão de FAQs |

> ⚠️ Antes de rodar `scripts/limpar_banco.py`, leia [depende-de-voce.md](docs/depende-de-voce.md#4-índice-vetorial-do-mongodb-atlas--há-três-valores-conflitantes) — ele recria o índice vetorial com dimensão incompatível e quebra a busca de FAQs em silêncio.
