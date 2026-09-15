---
name: encerrar-sessao
description: "Fecha o dia: SESSAO em docs/progresso/sessoes/. Nao inventar atividade. Nao anexar .env."
---

# Skill: encerrar-sessao

1. `git log --oneline --since="00:00"`
2. Criar `docs/progresso/sessoes/SESSAO_AAAA-MM-DD_<slug>.md` com: sumário, commits, problemas, decisões, próximas ações.
3. Atualizar checklist em `docs/progresso/PLANO_IMPLEMENTACAO.md` se o estado mudou.
4. Versionar se o usuário pedir commit, no padrão do skill `commit` (ex.: `📝 docs(geral): registra sessao 2026-09-14_14-09-26_21-10`).
5. Perguntar push (`exporte`) e backup.

Sem `tools/glpi/`, não anexar ticket. Nunca `--force`. Não inventar o que não aconteceu.
