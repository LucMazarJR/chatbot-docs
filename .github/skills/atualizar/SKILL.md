---
name: atualizar
description: "Sincroniza local com GitHub e Gitness: importe (mescla os dois) ou exporte (Gitness padrao). Nao usar para backup."
---

# Skill: atualizar

## Diagnóstico

```bash
git branch --show-current
git remote -v
git fetch origin
git fetch gitness
git status -sb
git log --oneline HEAD..origin/<b>
git log --oneline HEAD..gitness/<b>
git log --oneline origin/<b>..HEAD
git log --oneline gitness/<b>..HEAD
```

| Situação | Ação |
|---|---|
| Limpo, sync com os dois | Nada |
| Limpo, local atrás de um ou dos dois | `importe` (ponderar e mesclar os dois) |
| Limpo, local à frente do Gitness | `exporte` (Gitness padrão; perguntar GitHub) |
| Remotos divergiram entre si | `importe` (merge dos dois no local, parar se conflito) |
| Sujo | Commit se o usuário pediu, senão stash/abortar |

## Merge (só se diverged e `importe` pediu)

Working tree limpa. Conflito: listar arquivos e **parar**. Sem `--force` / `reset --hard` / `rebase -i`.

`exporte` manda primeiro ao Gitness e **sempre pergunta** pelo GitHub.

Branch de trabalho: `main` ou `feat/...`.
