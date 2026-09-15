---
name: glpi-task-upsert
description: "Cria/atualiza ProjectTask no GLPI com hierarquia S(pai)/P(filho). Estado GEP, %, datas. Opcional: --attach=arquivo."
---

# Skill: glpi-task-upsert

**Neste repo:** só se existir `tools/glpi/`. Sem CLI, parar.

Atualiza a **tarefa de projeto** (`ProjectTask`) no GLPI.

**Execução preferencial:** `./tools/glpi/bin/glpi-task-upsert` (wrapper; a skill só orquestra).

## Hierarquia

| Plano | Código | GLPI | Flag |
|-------|--------|------|------|
| Fase / semana | `S4` | Tarefa **pai** | `--code=S4` |
| Item | `S4.P5` | **Subtarefa** | `--code=S4.P5 --parent-code=S4` |

## Comandos

```bash
# Pai
./tools/glpi/bin/glpi-task-upsert --code=S4 --name="S4 — Unidade móvel" --state=gep3 --percent=60

# Filho
./tools/glpi/bin/glpi-task-upsert --code=S4.P5 --parent-code=S4 \
  --name="Fila offline sync" --state=gep1 --percent=0

# Gravar
./tools/glpi/bin/glpi-task-upsert --code=S4.P5 --parent-code=S4 --name="..." --apply

# Gravar + anexar evidência (Document na ProjectTask)
./tools/glpi/bin/glpi-task-upsert --code=S4.P5 --parent-code=S4 --name="..." \
  --attach=docs/05_progresso/geral/SESSAO_....md --apply
```

Lote a partir do retro-scan: `./tools/glpi/bin/glpi-retro-apply --from=JSON [--apply]`.

Anexo avulso (sem upsert):

```bash
./tools/glpi/bin/glpi-document-attach --file=PATH --code=S4.P5 --apply
```

## Datas e GEP (retro / upsert)

- `gep7` (feito): `real_start` / `real_end` quando disponíveis.
- `gep3` (em andamento): `real_end` deve ficar **vazio** (exceto timestamps confirmados no plano).
- `gep1` (não iniciado): `real_start` e `real_end` **vazios** (exceto confirmados).

## Regras

- Dry-run por padrão; `--apply` só com confirmação.
- `GLPI_DRY_RUN=1` força dry-run.
- `--attach` só sobe arquivo se `--apply` e houver id da tarefa.
- Pais S0–S7: `./tools/glpi/bin/glpi-seed-phases --template=samu-s-phases`

## Referências

- `docs/06_glpi/HIERARQUIA_S_P_GLPI.md`
- `tools/glpi/bin/glpi-task-upsert`
- `tools/glpi/bin/glpi-document-attach`
- `.glpi/maps/states.json`
