# AGENTS.md — Chatbot PET-SAÚDE

Conduta do agente neste repositório. Skills em [`.github/skills/`](.github/skills/). Matriz: [`.github/skills/GUIA_USO_SKILLS.md`](.github/skills/GUIA_USO_SKILLS.md). Escopo: [`.github/skills/escopo da IA.md`](.github/skills/escopo%20da%20IA.md).

## O que é este projeto

Chatbot de atendimento em saúde (PET-SAÚDE). Quatro peças, responsabilidade separada:

| Pasta | Dono de |
|---|---|
| `backend/` | Canal WhatsApp (NestJS + Baileys). Substitui o WAHA. |
| `n8n/` | Inteligência: Gemini, busca vetorial, memória. |
| `pwa/` | Protótipo web com cara de WhatsApp. |
| `scripts/` | Ingestão de FAQs (Drive → embeddings → Atlas). |

Dashboard de FAQs vive em repositório próprio (`Dashboard-PetSaude`). Sem essa pasta, **não** ligar `COMPOSE_PROFILES=dashboard`.

## Antes de agir

1. Ler o skill certo em `.github/skills/<nome>/SKILL.md` (ver o guia).
2. Situação do projeto: `docs/handoff-notebook.md` e `docs/progresso/PLANO_IMPLEMENTACAO.md`.
3. Portas neste host municipal: `docs/mapa-portas-172-21-31-167.md`.
4. Não reinterpretar decisões de `docs/depende-de-voce.md`.

## Remotos Git

| Remote | URL | Papel |
|---|---|---|
| `origin` | `https://github.com/LucMazarJR/chatbot-docs.git` | GitHub (só no `exporte` se o usuário confirmar) |
| `gitness` | `https://gitness.franca.sp.gov.br/git/PetSaudeGrupo1/chatbot-docs.git` | Destino padrão do `exporte`; fonte junto com o GitHub no `importe` |

- Branch de trabalho: `main`, ou feature (`feat/...`).
- `importe`: fetch dos dois, ponderar e mesclar. Não puxar só um remoto.
- `exporte`: push no `gitness` por padrão; **sempre perguntar** se envia também ao GitHub. SSH na porta 22 do Gitness não abre (HTTPS + PAT).
- Nunca commitar `.env`, tokens, `credentials.json`.
- Nunca `--force` em `main`.
- Não alterar `git config` global.

## Commit

Padrão rígido (skill `commit`):

```text
<gitmoji> <tipo>(<escopo>): <mensagem-em-pt-br-sem-acentos>_DD-MM-AA_hh-mm
```

Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`.  
Escopos: `pwa`, `n8n`, `gateway`, `compose`, `infra`, `docs`, `scripts`, `skills`.  
Timestamp no fuso `America/Sao_Paulo`. Exemplo: `✨ feat(pwa): abrir o chat sem saudacao_14-09-26_21-10`.

## Docker neste host (`172.21.31.167`)

Portas do host: gateway `3800`, n8n `3801`, PWA `3802`, Postgres `5534`.  
Não usar `3690`/`3691` (Bot_Pan), `3700`/`3701` (SAMU), `5532`/`5533`/`5535`.

```bash
docker compose -f docker-compose.yml -f docker-compose.franca.yml up -d --build redis postgres n8n pwa whatsapp-gateway
```

Não subir `cloudflared` neste host. Não incluir `dashboard` sem a pasta do dashboard.

## Regras que quebram em silêncio

- Modelo de embedding **idêntico** em scripts, n8n e dashboard: `gemini-embedding-2`, `SEMANTIC_SIMILARITY`, 3072 dimensões.
- `MONGODB_URI` com nome do banco no caminho (`ministerio_saude`). Sem isso o driver cai em `test`.
- Índice que o n8n consulta: `vector_index_3072`. Não rodar `scripts/limpar_banco.py` sem ler `docs/depende-de-voce.md`.
- Trocar `N8N_WEBHOOK_TOKEN` ou `N8N_PWA_WEBHOOK_TOKEN` exige `.env` **e** credencial Header Auth no n8n.
- O gateway **não** grava texto de mensagem em log (dado de saúde).

## Skills — o que executar / o que ignorar

**Ativas:** `oncoto-oncovo`, `commit`, `importe`, `exporte`, `atualizar`, `documentar`, `documente-o-plano`, `registrar-tentativa`, `revisar-docs`, `encerrar-sessao`, `backup`, `build-backend`, `build-web`, `deploy-backend`, `deploy-web`.

**Inativas** (kit copiado; não há mobile, APK nem `pmf-dev-kit` aqui): `build-mobile`, `deploy-mobile`, `empacotar-apk`, `atualizar-kit`.

**GLPI:** só se existir `tools/glpi/` neste clone. Senão, não inventar CLI nem ticket.

## Resposta padrão

1. Resultado objetivo  
2. Onde isso está no plano / na doc  
3. Próximo passo único  
4. No máximo 2 extras alinhados ao plano  
