---
name: registrar-tentativa
description: "Registra falha ou acerto parcial de compose, n8n, Atlas, Gemini, SSH ou QR do chatbot PET-SAUDE em docs/problemas-e-solucoes/."
---

# Skill: registrar-tentativa

## Destino

```text
docs/problemas-e-solucoes/TENTATIVA_AAAA-MM-DD_<slug>.md
```

Não usar `docs/03-compilacao/` (Bot_Pan).

## Conteúdo

1. O que foi tentado (comando, host, serviço)
2. O que falhou (trecho de erro, sem secretos)
3. O que mudou
4. Próximo item do plano
5. Alternativas só se alinhadas ao plano

## Escopos típicos

Compose / `docker-compose.franca.yml` · n8n webhook 403/404 · Mongo `test` vs `ministerio_saude` · índice `vector_index_3072` · Gemini 429 · SSH `172.21.31.167:22022` · QR do gateway · token n8n dessincronizado do `.env`

Não colar `.env`, PAT, URI com senha. Sugerir commit no padrão do skill `commit` se o usuário quiser versionar.
