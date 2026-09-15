---
name: deploy-web
description: "Sobe o PWA no compose do PET-SAUDE. Host municipal porta 3802; local 8080."
---

# Skill: deploy-web

```bash
docker compose -f docker-compose.yml -f docker-compose.franca.yml up -d --build pwa
curl -s http://127.0.0.1:3802/api/health
```

No `.env` do servidor: `PWA_PORT=3802`. Traefik (a criar na infra): `dev.franca.sp.gov.br` + path `/petsaude`.

Não subir `cloudflared` neste host. Webhook n8n: `/webhook/pwa-chat` + `N8N_PWA_WEBHOOK_TOKEN` igual à credencial Header Auth.

Local sem override: `PWA_PORT=8080`.
