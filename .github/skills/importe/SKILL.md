---
name: importe
description: "Traz e mescla commits do GitHub (origin) e do Gitness. Use para pull/fetch/importar. Nao commitar nem fazer push."
---

# Skill: importe

Os dois remotos são fonte. Fetch dos dois, **ponderar** o que cada um tem a mais e **mesclar** no branch local. Não escolher um e ignorar o outro.

Remotos: `origin` = GitHub · `gitness` = `https://gitness.franca.sp.gov.br/git/PetSaudeGrupo1/chatbot-docs.git`

## Fluxo

1. `git branch --show-current` · `git remote -v` · `git status -sb`
2. Working tree suja: uma pergunta — stash `importe-temp` ou abortar. Nunca descartar.
3. Fetch dos dois (falha de auth em um não cancela o outro — registrar e seguir com o que veio):

```bash
git fetch origin
git fetch gitness
```

4. Comparar o branch ativo `<b>`:

```bash
git log --oneline HEAD..origin/<b>      # só no GitHub
git log --oneline HEAD..gitness/<b>     # só no Gitness
git log --oneline origin/<b>..gitness/<b>
git log --oneline gitness/<b>..origin/<b>
```

Se o branch não existir num remoto, anotar e usar só o que existe.

5. Tabela curta na resposta: commits só GitHub / só Gitness / comuns. Aí mesclar.

| Situação | Ação |
|---|---|
| Nenhum remoto à frente | "local já atualizado" |
| Só um remoto à frente, ff-only cabe | `git merge --ff-only <remoto>/<b>` |
| Os dois à frente e **não** divergiram entre si | ff-only no que estiver mais à frente (o outro já está contido) |
| Os dois divergiram (cada um tem commit que o outro não tem) | `git merge gitness/<b>` e em seguida `git merge origin/<b>` (ou o inverso se um merge já trouxe o outro). Conflito: listar arquivos e **parar** |
| Um fetch falhou | Mesclar só o remoto obtido; avisar o que ficou de fora |

6. Relatório: HEAD, o que entrou de cada remoto, se ficou divergência pendente.

## Proibido

`--force`, `reset --hard`, `rebase -i`. Não commitar. Não alterar `git config`. Não tratar o Gitness como espelho só de leitura.
