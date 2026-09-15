---
name: deploy-backend
description: "Sobe o gateway WhatsApp na stack Docker do PET-SAUDE. Host municipal 172.21.31.167, porta 3800."
---

# Skill: deploy-backend

Não usar `npm run deploy:server` nem pasta `~/Bot_Pan`.

## Host municipal

```bash
ssh -p 22022 ricardodavid@172.21.31.167
cd /opt/projects/web/saude/chatbot-docs-stack-teste   # ou a pasta real do deploy
docker compose -f docker-compose.yml -f docker-compose.franca.yml up -d --build whatsapp-gateway
```

Conferir: `127.0.0.1:3800` (QR/Swagger). Não publicar na internet. Não `DELETE` da sessão (apaga credenciais).

## Local

`docker compose up -d --build whatsapp-gateway` — porta `3000`.

Falha de SSH/QR → `registrar-tentativa`. Portas: `docs/mapa-portas-172-21-31-167.md`.
