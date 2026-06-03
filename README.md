# PET-BOT — Chatbot de Atendimento via WhatsApp

Chatbot de saúde animal que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o modelo Gemini.

## Estrutura do projeto

```
chatbot/
├── docker-compose.yml        # Infraestrutura local (n8n, WAHA, Redis, Cloudflare)
├── .env                      # Credenciais da infra (não commitado)
├── .env.example              # Modelo das variáveis da infra
├── docs/
│   ├── chatbot.md            # Como o chatbot funciona + guia de reimplementação
│   └── faq-scripts.md        # Como usar os scripts de ingestão de FAQs
├── n8n/
│   └── Whatsaap PET-BOT.json # Fluxo exportado do n8n
└── scripts/                  # Scripts Python de ingestão de FAQs
    ├── .env.example          # Modelo das variáveis dos scripts
    ├── enviar_dados.py       # Sincroniza FAQs do Drive para o MongoDB
    ├── gerar_embeddings.py   # Gera embeddings para docs sem vetor
    ├── limpar_banco.py       # Limpa o banco e recria o índice vetorial
    ├── limpar_embeddings.py  # Remove embeddings dos documentos
    ├── test_enviar_dados.py  # Testa extração sem tocar no banco
    └── lib/
        └── gemini_embendding.py  # Wrapper da API de embeddings do Gemini
```

## Documentação

- [Como o chatbot funciona e como reimplementar](docs/chatbot.md)
- [Como usar os scripts de FAQ](docs/faq-scripts.md)

## Início rápido

```powershell
# 1. Copie e preencha o .env com as credenciais da infra
cp .env.example .env

# 2. Suba os containers
docker compose up -d

# 3. Acesse o n8n e importe o fluxo
# http://localhost:5678
# Importar: n8n/Whatsaap PET-BOT.json
```

Veja [docs/chatbot.md](docs/chatbot.md) para o guia completo de configuração.
