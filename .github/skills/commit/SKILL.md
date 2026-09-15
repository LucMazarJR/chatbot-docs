---
name: commit
description: "Commits padronizados PET-SAUDE — gitmoji + conventional + timestamp PT-BR. Use quando o usuario pedir commit."
---

# Skill: commit

Só executar se o usuário pediu commit. Protocolo git do usuário: status, diff, log; não alterar `git config`; não `--no-verify`.

## Formato obrigatório

```text
<gitmoji> <tipo>(<escopo>): <mensagem-em-pt-br-sem-acentos>_DD-MM-AA_hh-mm
```

| Parte | Regra |
|---|---|
| gitmoji | No início, coerente com o tipo |
| tipo | `feat` `fix` `docs` `chore` `refactor` `test` `perf` |
| escopo | `pwa` `n8n` `gateway` `compose` `infra` `docs` `scripts` `skills` |
| mensagem | Português-BR, sem acento, uma intenção só |
| timestamp | `_DD-MM-AA_hh-mm` no fuso `America/Sao_Paulo` |

### Gitmoji

| Tipo | Emoji |
|---|---|
| feat | ✨ |
| fix | 🐛 |
| docs | 📝 |
| refactor | ♻️ |
| chore | 🔧 |
| test | ✅ |
| perf | ⚡ |

### Exemplo

`📝 docs(skills): restaurar padrao de commit com gitmoji_14-09-26_21-10`

## Não incluir

`.env`, `.env.*`, tokens, `credentials.json`, `node_modules/`, `Dashboard-PetSaude/`, `*:Zone.Identifier`.

## Depois do commit

Skill `exporte`: Gitness por padrão; **perguntar** se envia ao GitHub.
