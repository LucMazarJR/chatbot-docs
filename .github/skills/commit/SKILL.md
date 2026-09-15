---
name: commit
description: "Commits deste repositório no formato tipo(escopo): descricao. Use quando o usuario pedir commit. Nao usar gitmoji nem timestamp SAMU."
---

# Skill: commit

Só executar se o usuário pediu commit. Seguir o protocolo git do usuário (status, diff, log; não alterar `git config`; não `--no-verify`).

## Formato

```text
tipo(escopo): descricao em portugues
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`.  
Escopos: `pwa`, `n8n`, `gateway`, `compose`, `infra`, `docs`, `scripts`.

Exemplos deste repo: `docs(infra): mapa de portas do PET no host 172.21.31.167` · `feat(pwa): ...`

**Proibido:** gitmoji; sufixo `_DD-MM-AA_hh-mm` do SAMU/Bot_Pan.

## Não incluir

`.env`, `.env.*`, tokens, `credentials.json`, `node_modules/`, `Dashboard-PetSaude/` (repo separado).

## Depois do commit

Se o usuário também pediu push: skill `exporte` (Gitness padrão; perguntar se envia ao GitHub).
