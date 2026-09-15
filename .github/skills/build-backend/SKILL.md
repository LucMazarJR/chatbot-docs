---
name: build-backend
description: "Build e teste do whatsapp-gateway (NestJS) em backend/. Nao e o Bot_Pan."
---

# Skill: build-backend

Serviço: `whatsapp-gateway` em `backend/`.

```bash
cd backend && npm test
docker compose build whatsapp-gateway
```

Health (local): `http://localhost:3000/health/live`  
Health (Franca, túnel SSH): `http://127.0.0.1:3800/health/live` com `X-Api-Key`.

Não misturar com PWA. Falha → `registrar-tentativa`. Não logar texto de mensagem.
