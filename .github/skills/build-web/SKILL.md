---
name: build-web
description: "Build e health do PWA (Next.js) em pwa/. Nao e frontend Bot_Pan nem SAMU."
---

# Skill: build-web

```bash
cd pwa && npm run typecheck && npm run build
docker compose build pwa
curl -s http://localhost:8080/api/health    # local
curl -s http://127.0.0.1:3802/api/health    # host 172.21.31.167
```

Esperado: `{"status":"ok"}` (Mongo ok). Sem pasta `Dashboard-PetSaude/`, o painel `/conversas` não sobe neste compose.
