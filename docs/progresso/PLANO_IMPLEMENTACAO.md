# Plano — chatbot PET-SAÚDE

Ponteiro para o agente (`oncoto-oncovo`). Instalação: [instalacao.md](../instalacao.md). Armadilhas: [armadilhas.md](../armadilhas.md). Produção: [caminho-para-producao.md](../caminho-para-producao.md). Portas no host municipal: [mapa-portas-172-21-31-167.md](../mapa-portas-172-21-31-167.md).

**Fase atual:** teste interno. Conduta/skills no repo. Espelho municipal no Gitness (destino padrão do `exporte`). Compose no host `172.21.31.167` ainda não é o dia a dia.

## Checklist

| Item | Status | Critério |
|---|---|---|
| Repo no GitHub | [x] | `origin` = LucMazarJR/chatbot-docs |
| Espelho Gitness | [x] | `PetSaudeGrupo1/chatbot-docs` com `main` |
| Conduta e skills PET | [x] | `AGENTS.md` + `.github/skills/` adaptados; `importe` mescla os dois remotos |
| `.env` local preenchido | [x] | Compose sobe sem `:?defina` (não versionar) |
| Profile `dashboard` desligado neste clone | [ ] | `COMPOSE_PROFILES=` — sem pasta `Dashboard-PetSaude/` |
| Portas Franca no `.env` / override | [ ] | PWA `3802`, Postgres `5534` |
| Stack no `172.21.31.167` | [ ] | `docker compose -f docker-compose.yml -f docker-compose.franca.yml ps` saudável |
| Fluxo n8n PWA ativo | [ ] | POST `/webhook/pwa-chat` ≠ 404 |
| Chat em `http://127.0.0.1:3802` ou Traefik `/petsaude` | [ ] | `/api/health` → `{"status":"ok"}` |
| Índice Atlas `vector_index_3072` | [~] | Confirmar no painel; não rodar `limpar_banco.py` |
| Nome canônico do índice (scripts × n8n) | [ ] | `docs/depende-de-voce.md` |
| Cota/dona da chave Gemini | [ ] | `docs/depende-de-voce.md` |

Legenda: `[ ]` pendente · `[~]` parcial · `[x]` feito.

Planos S/P novos: skill `documente-o-plano` → `docs/progresso/<modulo>/`.
