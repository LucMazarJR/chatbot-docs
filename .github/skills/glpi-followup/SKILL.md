---
name: glpi-followup
description: "DEPRECATED alias de acompanhar-chamado. Use acompanhar-chamado (acompanhar chamado / registrar acompanhamento / follow-up GLPI). Redireciona para a skill primaria."
---

# Skill: glpi-followup (deprecated)

**Neste repo:** só se existir `tools/glpi/`. Sem CLI, parar.

**Deprecated.** Preferir a skill **`acompanhar-chamado`**.

Se esta skill for acionada (nome legado `glpi-followup`), carregar e seguir **integralmente** [`.github/skills/acompanhar-chamado/SKILL.md`](../acompanhar-chamado/SKILL.md) — titulo sugerido + edicao/default, envio `ITILFollowup`, anexo opcional.

CLI (inalterado):

```bash
./tools/glpi/bin/glpi-followup - "<texto>"
```
