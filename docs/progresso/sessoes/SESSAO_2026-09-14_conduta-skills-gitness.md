# Sessão 2026-09-14 — conduta, skills e Gitness

## Sumário executivo

O clone local ganhou conduta de agente (`AGENTS.md`, regra Cursor, skills adaptadas do kit SAMU/Bot_Pan) e o remoto municipal `gitness` passou a ser destino padrão de exportação. O `.env` foi preenchido na máquina e **não** foi versionado. A stack Docker no `172.21.31.167` ainda não subiu neste dia.

## Commits da sessão

- `2db9f8b` `docs(infra): mapa de portas do PET no host 172.21.31.167` (rebase em cima da `main` remota)
- (este encerramento) conduta + skills + sessão

## Problemas

- Push HTTPS no GitHub sem credencial no `git`; SSH autentica como RicardoDavitec (agora com permissão).
- Push no Gitness exige PAT (HTTPS). SSH :22 do Gitness não abre.
- `COMPOSE_PROFILES=dashboard` no `.env` quebraria o compose neste clone (sem `Dashboard-PetSaude/`).
- Portas do `.env` ainda são as da máquina original (`8080`, `55432`), não as do mapa Franca (`3802`, `5534`).

## Decisões

- Dois remotos: `origin` = GitHub, `gitness` = PetSaudeGrupo1/chatbot-docs.
- `importe` mescla os dois; `exporte` manda ao Gitness e pergunta pelo GitHub.
- Skills mobile/APK/`atualizar-kit` inativas. GLPI só com `tools/glpi/`.
- Commit no formato já do repo (`tipo(escopo): descricao`), sem gitmoji SAMU.

## Próximas ações

1. Ajustar `.env` do servidor (portas 38xx/5534, `COMPOSE_PROFILES=`).
2. Subir a stack com `docker-compose.franca.yml` no `172.21.31.167`.
3. Ativar fluxo n8n `/webhook/pwa-chat` e validar `http://127.0.0.1:3802/api/health`.
