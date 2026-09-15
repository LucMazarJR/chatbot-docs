---
name: revisar-docs
description: "Audita docs/ deste chatbot: links, nomes, contradicao com o compose e o mapa de portas."
---

# Skill: revisar-docs

Escopo padrão: `docs/`. Relatório em `docs/progresso/AUDITORIA_DOCS-DD_MM_AA.md` (não `docs/05-gestao-projeto`).

## Verificar

1. Links internos quebrados
2. Portas citadas vs `docs/mapa-portas-172-21-31-167.md` e `docker-compose.franca.yml`
3. Modelo de embedding citado vs `gemini-embedding-2` / 3072
4. Fluxos n8n (`whatsapp-chatbot.json`, `pwa-chatbot.json`) vs rotas nas docs
5. Menções a WAHA, `/admin` do PWA ou `PWA_ADMIN_PASSWORD` (legado)

Classificar: crítico / importante / leve. Corrigir só com confirmação de escopo. Commit: skill `commit`.
