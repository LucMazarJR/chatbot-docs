---
name: documente-o-plano
description: "Cria plano S/P em docs/progresso com checklist. Use quando o usuario pedir documente o plano, criar plano ou planejar sessao."
---

# Skill: documente-o-plano

Planos objetivos. Destino neste repo: `docs/progresso/` (não `docs/05_progresso` do kit SAMU).

## Fluxo

1. Confirmar módulo: `geral` | `infra` | `pwa` | `n8n` | `gateway` | `scripts`
2. Ler `docs/progresso/PLANO_IMPLEMENTACAO.md` e a doc de domínio (`handoff`, `chatbot`, `prototipo-pwa`, `depende-de-voce`). Não inventar regra de negócio.
3. Criar:

```text
docs/progresso/<modulo>/<nome_do_plano>-DD_MM_AA-hh_mm.md
```

4. Se for o plano vigente da fase, atualizar também o ponteiro `docs/progresso/PLANO_IMPLEMENTACAO.md`.

## Hierarquia

| Nível | Significado | Code |
|---|---|---|
| **S** | Fase | `S0`, `S1`, … |
| **P** | Tarefa | `S1.P1`, … |

Marcadores: `- [ ]` · `- [~]` · `- [x]`

## Template mínimo

```markdown
# <titulo>

> Atualizado: DD/MM/AAAA

## Objetivo
## S0 — …
- [ ] `S0.P1` …
## Fontes
- docs/...
```

Timestamps `<!-- glpi: plan_* -->` são opcionais. Sync GLPI só com `tools/glpi/` presente.
