---
name: glpi-retro-scan
description: "Levanta candidatos hierárquicos S(fase)/P(pacote~2h) a ProjectTask a partir de planos/checklists (mono/polyrepo). Com --pack, átomos ficam só no content."
---

# Skill: glpi-retro-scan

**Neste repo:** só se existir `tools/glpi/`. Sem CLI, parar.

Varre `.glpi/workspace.yaml` e gera relatório de candidatos (dedupe por código S/P).

**Execução preferencial:** wrapper em `tools/glpi/bin/` (não depende da skill).

## Comando

```bash
./tools/glpi/bin/glpi-retro-scan
./tools/glpi/glpi retro-scan --pack --pack-target-min=120
```

Saída:

- sem pack: `docs/06_glpi/retro-scans/YYYY-MM-DD_HHMM_<bundle>.md` (+ `.json`)
- com `--pack`: `…_<bundle>_pack.md` (+ `.json`) — **não sobrescreve** artefato anterior

## Três níveis (`--pack`)

| Nível | GLPI | Papel |
|-------|------|--------|
| Fase (S) | ProjectTask pai | Sprint/fase ou módulo `M.BACKEND` |
| Pacote (P) | ProjectTask filho | Unidade ~2h (default 120 min) |
| Átomo | só no `content` | Linha de checklist/commit (evidência) |

JSON inclui `pack` (estatísticas), `candidates` (fases+pacotes para apply) e `atoms_detail` (auditoria).

Env: `GLPI_RETRO_PACK_MODE=on`, `GLPI_RETRO_PACK_TARGET_MIN`, `GLPI_RETRO_PACK_GAP_MIN`.

## Datas e GEP no JSON

- Commits / blame / similaridade preenchem `real_*` quando aplicável.
- **Após** reconciliar status:
  - `gep3` (em andamento) → `real_end = null` (exceto `temporal_source` confirmado: `plan`, `checklist-comment`)
  - `gep1` (não iniciado) → `real_start` e `real_end` = `null` (mesma exceção)
- `gep7` (feito) mantém as datas inferidas ou confirmadas.
- Com pack: datas do pacote = min/max dos átomos; `%` agregado.

## Conteúdo sugerido (GLPI)

Sem pack — procedência polyrepo:

```text
Hierarquia: kind=… code=… parent=…
Repos: Bot_Pan, Bot_Pan_Cursor
Fontes:
- plan docs/…/PLANO_….md:110
```

Com pack — checklist de átomos:

```text
Nivel: pacote (P) | Modulo: web | Atomos: 7 | Esforco: 118 min
Atomos:
- [x] Implementar mapa …
- [ ] Clustering …
Fontes:
- …
```

Limites: `GLPI_RETRO_CONTENT_MAX` (4000) · `GLPI_RETRO_CONTENT_MAX_SOURCES` (12) · `GLPI_RETRO_PACK_CONTENT_MAX_ATOMS` (40).

## Pós-scan (apply fase→pacote)

```bash
./tools/glpi/bin/glpi-retro-apply --from=docs/06_glpi/retro-scans/ARQUIVO_pack.json
./tools/glpi/bin/glpi-retro-apply --from=... --kinds=phase --limit=8
./tools/glpi/bin/glpi-retro-apply --from=... --apply   # após revisão
```

## Anexo do relatório (após revisão)

O scan **não** grava no GLPI. Depois de revisar o `.md`/`.json`, opcionalmente anexar ao Project ou Ticket:

```bash
./tools/glpi/bin/glpi-document-attach --file=docs/06_glpi/retro-scans/ARQUIVO_pack.md --project
./tools/glpi/bin/glpi-document-attach --file=docs/06_glpi/retro-scans/ARQUIVO_pack.md --ticket --apply
```

## Referências

- `docs/06_glpi/HIERARQUIA_S_P_GLPI.md`
- `tools/glpi/bin/` — scripts de execução direta
- `tools/glpi/bin/glpi-document-attach`
- `tools/glpi/lib/retro_scan.py` / `retro_apply.py`
