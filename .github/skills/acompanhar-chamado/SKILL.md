---
name: acompanhar-chamado
description: "Use para acompanhar chamado, registrar acompanhamento, follow-up GLPI, glpi-followup. Sugere titulo no padrao Modulo-Fase-Pacote-acao, pergunta edicao e envia ITILFollowup (anexo opcional)."
argument-hint: "Opcional: resumo da entrega ou codigo Sx.Py (ex: Web F1-P2 CRUD usuario)."
---

# Skill: acompanhar-chamado

**Neste repo:** só executar se existir `tools/glpi/`. Sem o CLI, informar isso e parar — não inventar ticket nem token.

Registra **acompanhamento** no chamado GLPI (`ITILFollowup`) via CLI deste repositorio.

Alias legado (nao usar como skill primaria): `glpi-followup`.

## Pre-requisitos

- `curl`, `jq`
- Secrets (`~/.secrets/glpi.env` ou legado `GLPI-tokens.txt`; variaveis `GLPI_*`)
- Homolog: `./tools/glpi/glpi --env=homolog …` (banner HOMOLOG; nao grava em producao)
- `.glpi/project.yaml` com `ticket_id` valido
- `.glpi/instance.yaml` (preset `api-vscode-glpi` na equipe PMF)

## Titulo (obrigatorio antes do envio)

O follow-up nao tem campo `name` na API; o **titulo** e a **primeira linha** do texto (cabecalho legivel no chamado).

### Padrao canônico

```text
{Modulo} - {Fase|esporadico} [- {Pacote}] - {Acao concreta}
```

| Parte | Valores | Regra |
|-------|---------|--------|
| Modulo | `Web`, `Mobile`, `Backend`, `Geral`, `Infra`, `Docs`, `PostgreSQL` | Capitalizacao estavel |
| Fase | `F1`, `F2`, … ou `esporadico` | `esporadico` = fora do plano |
| Pacote | `P1`, `P2`, … | So quando for pacote/subtarefa |
| Acao | verbo + objeto + detalhe util | Proibir genericos |

**Proibido** como titulo: proximos passos, checklists, documentacao, fase de implementacao, pendencias, misc, WIP.

**Exemplos bons:**

- `Web - F1 - P2 - Criacao CRUD Usuario`
- `Web - F1 - Implementacao frontend dos paineis WEB`
- `Mobile - F2 - P1 - Correcao auth de login automatico`
- `Geral - esporadico - Benchmark fluxo chamado panico mobile -> backend -> PostgreSQL`
- `Backend - Rebuild e start versao V2.01`
- `Mobile - Build APK e AAB, versionamento V2.09 R23 - GPS integrado`

### Fluxo titulo + default

1. Montar **titulo sugerido** (IA) a partir do contexto (plano, diff, commit, argumento do usuario).
2. Mostrar ao usuario em uma linha, por exemplo:
   - `Titulo sugerido: «Web - F1 - P2 - Criacao CRUD Usuario»`
   - `Responder com o titulo editado, ou ok/sim/pode para confirmar. Sem edicao util → usa a sugestao.`
3. **Usar a sugestao da IA** quando:
   - resposta for `ok`, `sim`, `pode`, `confirmar`, vazia de edicao; ou
   - o usuario seguir o fluxo sem colar um titulo alternativo (default); ou
   - apos ~10s de silencio na mesma rodada, se a UI permitir espera — senao, default na ausencia de edicao explicita.
4. Se o usuario colar/editar um titulo → **usar a versao dele** (ainda validar lista proibida; se generico, pedir reescrita uma vez).
5. So entao montar o corpo e enviar (passo abaixo).

Nao enviar o follow-up sem ter resolvido o titulo (sugerido ou editado).

## Corpo do acompanhamento

Apos o titulo resolvido, montar o texto completo:

```text
{titulo}

{resumo objetivo 1-3 linhas}
Evidencia: commit {sha} / PR / health OK (se houver)
Proximo: {proximo passo curto}
```

## Comando — follow-up (texto)

```bash
./tools/glpi/bin/glpi-followup - "<texto completo com titulo na 1a linha>"
# equivalente:
./tools/glpi/glpi ticket followup - "<texto>"
./tools/glpi/glpi ticket followup <ticket_id> "<texto>"
```

Confirmar ID do follow-up na resposta da CLI. Marcar *follow-up GLPI enviado?* em `FLUXO_COMMIT_CHECKLIST.md` quando existir.

## Anexo opcional (apos o follow-up)

Evidencia periodica (`SESSAO_*`, plano, relatorio) no **mesmo Ticket**:

```bash
# dry-run
./tools/glpi/bin/glpi-document-attach --file=docs/05_progresso/geral/SESSAO_....md --ticket

# gravar
./tools/glpi/bin/glpi-document-attach --file=docs/05_progresso/geral/SESSAO_....md --ticket --apply
```

Perguntar ao usuario antes de `--apply` no anexo.

## Regras

- Nao enviar senhas, tokens ou dados clinicos.
- Nao anexar `.env`, `*token*`, `*secret*`, `*credential*`.
- Usar wrappers `tools/glpi/bin/` deste clone.
- Titulo no padrao acima; corpo curto e factual.

## Auxiliares

```bash
./tools/glpi/glpi ticket get
./tools/glpi/glpi project tasks
./tools/glpi/glpi states discover --apply
```

## Referencias

- `docs/06_glpi/HIERARQUIA_S_P_GLPI.md` (titulacao S/P)
- `docs/06_glpi/MANUAL_USO_GLPI.md`
- `docs/06_glpi/MANUAL_INTEGRACAO_GLPI.md`
- `tools/glpi/README.md`
- Alias legado: skill `glpi-followup`
