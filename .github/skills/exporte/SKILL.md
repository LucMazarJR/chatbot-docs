---
name: exporte
description: "Publica o branch no Gitness por padrao. Sempre pergunta se tambem envia ao GitHub. Use para push/exportar."
---

# Skill: exporte

Status → commit (só se o usuário pediu e houver mudança) → **push no `gitness`**. O GitHub **não** é automático.

## Destino

| Remote | Quando |
|---|---|
| `gitness` | **Padrão.** Sempre enviar, salvo o usuário vetar. |
| `origin` (GitHub) | **Só depois de perguntar** e o usuário dizer sim. Nunca assumir que sim. |

Pergunta obrigatória, mesmo se o usuário disse só "exporte" ou "push":

> Enviar também para o GitHub (`origin`)?

## Fluxo

1. `git status -sb` · branch · `git remote -v`
2. Limpo e nada a publicar no Gitness: ainda assim dizer o estado vs os dois remotos
3. Sujo: `git diff --stat`; não incluir `.env`/secrets; commit via skill `commit` se o usuário confirmou — mensagem `<gitmoji> <tipo>(<escopo>): <descricao>_DD-MM-AA_hh-mm`
4. `git fetch origin` e `git fetch gitness`. Se o local estiver atrás de qualquer um: sugerir `importe` antes. Não empurrar por cima de histórico alheio.
5. `git push -u gitness <branch>` (HTTPS + PAT). SSH :22 do Gitness não abre.
6. **Perguntar** se envia ao GitHub. Só se sim: `git push -u origin <branch>`
7. Relatório: o que foi para o Gitness; GitHub enviado ou recusado/pendente

## Proibido

`--force` e `--force-with-lease` em `main`. Não inventar arquivos. Não gravar PAT na URL do remote nem no `git config`.

Auth Gitness: PAT no HTTPS. Auth GitHub (se autorizado): chave `id_ed25519_github` ou `gh`.
