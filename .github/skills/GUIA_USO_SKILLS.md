# Guia de skills — chatbot PET-SAÚDE

Kit original: pmf-dev-kit / Bot_Pan / SAMU. **Adaptado** a este repositório. Conduta: [`AGENTS.md`](../../AGENTS.md).

## Ativas

| Skill | Quando usar |
|---|---|
| `oncoto-oncovo` | Início de sessão, "onde estamos", antes de deploy |
| `commit` | Mensagem e `git commit` (só se o usuário pedir) |
| `importe` | Fetch GitHub **e** Gitness; ponderar e mesclar os dois no local |
| `exporte` | Push no Gitness por padrão; **sempre perguntar** se também envia ao GitHub |
| `atualizar` | Diagnóstico dos dois remotos — delega a importe ou exporte |
| `documentar` | Atualizar docs já existentes em `docs/` |
| `documente-o-plano` | Criar plano S/P em `docs/progresso/` |
| `registrar-tentativa` | Falha de compose, n8n, Atlas, Gemini, SSH, QR |
| `revisar-docs` | Auditoria de `docs/` |
| `encerrar-sessao` | Fechar o dia em `docs/progresso/sessoes/` |
| `backup` | Cópia `.tar.gz` do repo (sem `.env`) |
| `build-backend` | Build/teste do `whatsapp-gateway` |
| `build-web` | Build/teste do PWA |
| `deploy-backend` | Subir gateway (+ stack) no host `172.21.31.167` |
| `deploy-web` | Subir PWA no mesmo host / conferir `:3802` |

## Inativas (não executar)

Não há app mobile, APK, nem clone do `pmf-dev-kit` / `scripts/atualizar-kit` neste repo.

- `build-mobile`, `deploy-mobile`, `empacotar-apk`
- `atualizar-kit`

## GLPI (opcional)

Só se existir `tools/glpi/` neste clone. Sem isso, não chamar:

- `acompanhar-chamado` (alias legado: `glpi-followup`)
- `glpi-task-upsert`, `glpi-project-create`, `glpi-retro-scan`

Timestamps `<!-- glpi: ... -->` nos planos S/P podem existir; sync com o GLPI fica para quando o CLI estiver instalado.
