---
name: glpi-project-create
description: "Cria Project no GLPI (nome, codigo, estado GEP, datas). Dry-run por padrao."
---

# Skill: glpi-project-create

**Neste repo:** só se existir `tools/glpi/`. Sem CLI, parar.

Cria um **Project** novo na API GLPI. Usar quando o produto ainda nao tem `project_id` no `.glpi/project.yaml`.

## Comando

```bash
./tools/glpi/bin/glpi-project-create --name="Nome do produto" --code=CODIGO \
  --state=gep1 --priority=3 --content="Descricao"
# grava:
./tools/glpi/bin/glpi-project-create --name="..." --code=... --state=gep1 --apply
```

Apos criar, atualizar `.glpi/project.yaml` com o `project_id` retornado, depois:

1. `./tools/glpi/bin/glpi-seed-phases --template=samu-s-phases`
2. `./tools/glpi/bin/glpi-retro-scan`
3. `./tools/glpi/bin/glpi-retro-apply --from=JSON` (depois `--apply`)

## Referencias

- `docs/06_glpi/HIERARQUIA_S_P_GLPI.md`
- `.glpi/maps/states.json`
- `docs/06_glpi/MANUAL_USO_GLPI.md`
