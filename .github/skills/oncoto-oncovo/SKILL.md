---
name: oncoto-oncovo
description: "Situacao do chatbot PET-SAUDE: onde estou, onde vou, proximo passo. Use no inicio de sessao ou antes de deploy."
---

# Skill: oncoto-oncovo

Responda nestes 4 blocos.

## 1. Onde estou

- Fase / checklist em `docs/progresso/PLANO_IMPLEMENTACAO.md`
- Branch e remotes (`git status -sb`, `git remote -v`)
- Ambiente: WSL local · host `172.21.31.167` · só GitHub

## 2. Onde vou

- Próximo `[ ]` ou `[~]` do plano
- Bloqueios: `.env`/portas Franca, n8n ativo, Atlas `vector_index_3072`, cota Gemini

## 3. Estado do checklist

Tabela do plano: item | status | critério. Conferir com o que o git e os arquivos mostram, não inventar `[x]`.

## 4. Ação imediata

Um passo executável. No máximo 2 extras alinhados ao plano.

## Fontes

1. `docs/progresso/PLANO_IMPLEMENTACAO.md`
2. `docs/instalacao.md`
3. `docs/armadilhas.md`
4. `docs/caminho-para-producao.md`
5. `docs/mapa-portas-172-21-31-167.md`
6. `git log -5 --oneline` e `git status -sb`

## Deploy

| Perfil | Onde | Comando |
|---|---|---|
| local | WSL | `docker compose up -d --build redis postgres n8n pwa` (sem dashboard, sem cloudflared se for só chat) |
| municipal | `172.21.31.167` | `docker compose -f docker-compose.yml -f docker-compose.franca.yml up -d --build redis postgres n8n pwa whatsapp-gateway` |

PWA no host: `http://127.0.0.1:3802`. Traefik sugerido: `/petsaude` em `dev.franca.sp.gov.br`.
