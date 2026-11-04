import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Filter, ShieldAlert, X } from "lucide-react";

import { GateShell } from "@/components/gate";
import { FaqPagination } from "@/components/faq-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarAtores,
  listarAuditoria,
  type RegistroAuditoria,
  type TipoEntidade,
  type ValorAuditado,
} from "@/lib/auditoria.functions";
import { fimDoDia, inicioDoDia } from "@/components/filtros-faq";
import { exigirAdmin } from "@/lib/guardas";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Selo } from "@/components/selo";
import { dataEHora } from "@/lib/datas";

const POR_PAGINA = 25;
const TODOS = "__todos__";

/**
 * O que cada ação significa em português, e a que grupo pertence.
 *
 * LÓGICA DO LUCIANO: o backend grava a ação como identificador estável
 * (`login_recusado`), não como frase. Se a frase fosse gravada, mudar o texto da
 * tela exigiria reescrever o histórico inteiro, e registros antigos ficariam com
 * a redação velha. A tradução mora aqui.
 *
 * A mesma ação quer dizer coisas diferentes em áreas diferentes: `excluir` numa
 * conversa não é "Pergunta excluída". Por isso a chave `área:ação` vem primeiro,
 * e a ação sozinha fica como reserva.
 */
const ACOES: Record<string, { rotulo: string; verbo: string }> = {
  "categoria:inserir": { rotulo: "Categoria criada", verbo: "criou a categoria" },
  "categoria:editar": { rotulo: "Categoria editada", verbo: "editou a categoria" },
  "categoria:desativar": { rotulo: "Categoria desativada", verbo: "desativou a categoria" },
  "categoria:padronizar": { rotulo: "Grafia padronizada", verbo: "padronizou a grafia de" },
  "categoria:excluir": { rotulo: "Categoria excluída", verbo: "excluiu a categoria" },
  "conversa:excluir": { rotulo: "Conversa apagada", verbo: "atendeu um pedido de exclusão:" },
  "sistema:curadoria": { rotulo: "Análise de perguntas sem resposta", verbo: "rodou a análise:" },
  "sistema:descartar": { rotulo: "Sugestão descartada", verbo: "descartou a sugestão" },
  "notificacao:agendar": { rotulo: "Aviso agendado", verbo: "agendou" },
  "notificacao:cancelar": { rotulo: "Aviso cancelado", verbo: "cancelou" },
  inserir: { rotulo: "Pergunta criada", verbo: "criou" },
  editar: { rotulo: "Pergunta editada", verbo: "editou" },
  excluir: { rotulo: "Pergunta excluída", verbo: "excluiu" },
  criar_usuario: { rotulo: "Conta criada", verbo: "criou a conta de" },
  editar_usuario: { rotulo: "Conta alterada", verbo: "alterou" },
  desativar_usuario: { rotulo: "Conta desativada", verbo: "desativou" },
  redefinir_senha: { rotulo: "Senha redefinida", verbo: "redefiniu a senha de" },
  login: { rotulo: "Entrada", verbo: "entrou" },
  logout: { rotulo: "Saída", verbo: "saiu" },
  login_recusado: { rotulo: "Entrada recusada", verbo: "tentou entrar" },
  troca_de_senha: { rotulo: "Senha alterada", verbo: "alterou a própria senha" },
  troca_de_senha_recusada: {
    rotulo: "Troca de senha recusada",
    verbo: "tentou alterar a própria senha",
  },
};

const TIPOS: { valor: TipoEntidade; rotulo: string }[] = [
  { valor: "faq", rotulo: "Perguntas" },
  { valor: "categoria", rotulo: "Categorias" },
  { valor: "conversa", rotulo: "Conversas" },
  { valor: "notificacao", rotulo: "Avisos" },
  { valor: "usuario", rotulo: "Contas" },
  { valor: "sessao", rotulo: "Acessos" },
  { valor: "regra_importacao", rotulo: "Regra de leitura" },
  { valor: "sistema", rotulo: "Sistema" },
];

const NOME_CAMPO: Record<string, string> = {
  question: "Pergunta",
  answer: "Resposta",
  category: "Assunto",
  tags: "Tags",
  source: "Fonte",
  name: "Nome",
  email: "E-mail",
  role: "Papel",
  isActive: "Ativa",
  perguntas_ajustadas: "Perguntas ajustadas",
  mensagens: "Mensagens apagadas",
  sugestoes: "Sugestões",
  rodadas: "Rodadas",
  fora_de_escopo: "Fora de escopo",
  modelo: "Modelo",
  tipo: "Tipo",
  destinatarios: "Pessoas",
  enviarEm: "Enviar em",
  validaAte: "Vale até",
  mostrarDetalhe: "Detalhe na tela bloqueada",
  canceladas: "Canceladas",
};

export const Route = createFileRoute("/auditoria")({
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Histórico | Central de FAQs" }] }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  return (
    <GateShell>
      <PainelAuditoria />
    </GateShell>
  );
}

function valorLegivel(valor: ValorAuditado | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "(vazio)";
  if (Array.isArray(valor)) return valor.join(", ") || "(vazio)";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

/** O que mudou, campo a campo. É a diferença entre um log e uma auditoria. */
function Diferenca({ registro }: { registro: RegistroAuditoria }) {
  const campos = Object.keys({ ...(registro.before ?? {}), ...(registro.after ?? {}) });
  if (campos.length === 0) return null;

  return (
    <dl className="mt-3 space-y-2 border-t border-border pt-3">
      {campos.map((campo) => (
        <div key={campo}>
          <dt className="text-xs font-medium text-muted-foreground">
            {NOME_CAMPO[campo] ?? campo}
          </dt>
          <dd className="mt-0.5 space-y-0.5 text-sm">
            <p className="break-words text-destructive">
              <span aria-hidden="true">− </span>
              <span className="sr-only">Antes: </span>
              {valorLegivel(registro.before?.[campo])}
            </p>
            <p className="break-words text-success">
              <span aria-hidden="true">+ </span>
              <span className="sr-only">Depois: </span>
              {valorLegivel(registro.after?.[campo])}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Linha({ registro }: { registro: RegistroAuditoria }) {
  const [aberto, setAberto] = useState(false);
  const acao = ACOES[`${registro.entity_type}:${registro.action}`] ??
    ACOES[registro.action] ?? { rotulo: registro.action, verbo: registro.action };
  const temDetalhe = Boolean(registro.before || registro.after);
  const recusado = registro.status === "negado";

  return (
    <li className="border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="min-w-0 flex-1 break-words text-[15px]">
          {recusado && (
            <Selo
              tom="erro"
              icone={<ShieldAlert aria-hidden="true" />}
              className="mr-2 align-middle"
            >
              Recusada
            </Selo>
          )}
          <strong className="font-semibold">{registro.actor_name}</strong>{" "}
          <span className="text-muted-foreground">{acao.verbo}</span>
          {registro.question && <> “{registro.question}”</>}
        </p>
        <span className="shrink-0 text-sm text-muted-foreground">
          {dataEHora(registro.created_at)}
        </span>
      </div>

      {registro.batch_id && (
        <p className="mt-1 text-sm text-muted-foreground">Parte de uma importação em lote</p>
      )}

      {temDetalhe && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 mt-1"
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? "Ocultar o que mudou" : "Ver o que mudou"}
          </Button>
          {aberto && <Diferenca registro={registro} />}
        </>
      )}
    </li>
  );
}

function PainelAuditoria() {
  const [pagina, setPagina] = useState(1);
  const [actorId, setActorId] = useState("");
  const [entityType, setEntityType] = useState<TipoEntidade | "">("");
  const [status, setStatus] = useState<"sucesso" | "negado" | "">("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const filtros = {
    page: pagina,
    limit: POR_PAGINA,
    ...(actorId ? { actorId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(status ? { status } : {}),
    // Pontas do dia no fuso de quem filtra. Ver o comentario em filtros-faq.
    ...(inicioDoDia(de) ? { de: inicioDoDia(de) } : {}),
    ...(fimDoDia(ate) ? { ate: fimDoDia(ate) } : {}),
  };

  const ativos = [actorId, entityType, status, de, ate].filter(Boolean).length;

  const historico = useQuery({
    queryKey: ["auditoria", filtros],
    queryFn: () => listarAuditoria({ data: filtros }),
    placeholderData: keepPreviousData,
  });

  const atores = useQuery({ queryKey: ["auditoria-atores"], queryFn: () => listarAtores() });

  const trocar = (aplicar: () => void) => {
    aplicar();
    // Trocar filtro sempre volta para a primeira página: filtrar estando na
    // página 8 mostraria "nada encontrado" num resultado que tem 2 páginas.
    setPagina(1);
  };

  const limpar = () => {
    setActorId("");
    setEntityType("");
    setStatus("");
    setDe("");
    setAte("");
    setPagina(1);
  };

  const itens = historico.data?.items ?? [];

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Histórico"
        frase="Tudo que foi criado, alterado ou excluído, e quem fez. Inclui entradas no sistema e tentativas recusadas."
      />

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2.5 p-3">
          <Button
            type="button"
            variant="outline"
            aria-expanded={filtrosAbertos}
            onClick={() => setFiltrosAbertos((v) => !v)}
          >
            <Filter /> Filtros
            {ativos > 0 && (
              <span className="rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">
                {ativos}
              </span>
            )}
          </Button>

          {ativos > 0 && (
            <Button type="button" variant="ghost" onClick={limpar}>
              <X /> Limpar
            </Button>
          )}

          {/* O total só com a resposta: "0 registros" durante a espera diria
              que nada aconteceu. */}
          {historico.data && (
            <p className="ml-auto text-[15px] text-muted-foreground" aria-live="polite">
              {historico.data.total === 1
                ? "1 registro"
                : `${historico.data.total.toLocaleString("pt-BR")} registros`}
            </p>
          )}
        </div>

        {filtrosAbertos && (
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-pessoa">Pessoa</Label>
              <Select
                value={actorId || TODOS}
                onValueChange={(v) => trocar(() => setActorId(v === TODOS ? "" : v))}
              >
                <SelectTrigger id="filtro-pessoa" className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {(atores.data ?? [])
                    .filter((a) => a.id)
                    .map((a) => (
                      <SelectItem key={a.id as string} value={a.id as string}>
                        {a.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-tipo">O que</Label>
              <Select
                value={entityType || TODOS}
                onValueChange={(v) =>
                  trocar(() => setEntityType(v === TODOS ? "" : (v as TipoEntidade)))
                }
              >
                <SelectTrigger id="filtro-tipo" className="w-full">
                  <SelectValue placeholder="Tudo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Tudo</SelectItem>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-situacao">Situação</Label>
              <Select
                value={status || TODOS}
                onValueChange={(v) =>
                  trocar(() => setStatus(v === TODOS ? "" : (v as "sucesso" | "negado")))
                }
              >
                <SelectTrigger id="filtro-situacao" className="w-full">
                  <SelectValue placeholder="Tudo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Tudo</SelectItem>
                  <SelectItem value="sucesso">Concluídas</SelectItem>
                  <SelectItem value="negado">Recusadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="filtro-de">De</Label>
                <Input
                  id="filtro-de"
                  type="date"
                  value={de}
                  onChange={(e) => trocar(() => setDe(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-ate">Até</Label>
                <Input
                  id="filtro-ate"
                  type="date"
                  value={ate}
                  onChange={(e) => trocar(() => setAte(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {historico.isError ? (
        <EstadoFalha onTentarDeNovo={() => historico.refetch()} tentando={historico.isFetching}>
          Não foi possível carregar o histórico. Confira a internet e tente de novo.
        </EstadoFalha>
      ) : historico.isLoading && !historico.data ? (
        <Carregando texto="Carregando o histórico…" />
      ) : itens.length === 0 ? (
        <EstadoVazio
          titulo={ativos > 0 ? "Nenhum registro com estes filtros" : "Nada registrado ainda"}
          acao={
            ativos > 0 ? (
              <Button variant="outline" onClick={limpar}>
                Limpar os filtros
              </Button>
            ) : undefined
          }
        >
          {ativos > 0
            ? "Tente outro período ou outra pessoa."
            : "Cada alteração feita no painel passa a aparecer aqui."}
        </EstadoVazio>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {itens.map((r) => (
            <Linha key={r.id} registro={r} />
          ))}
        </ul>
      )}

      <FaqPagination
        page={pagina}
        totalPages={historico.data?.totalPages ?? 1}
        onPageChange={setPagina}
      />

      {/*
        O prazo aparece na tela de propósito. Registro de acesso é dado pessoal
        de gente identificada, e um prazo curto é o que sustenta guardá-lo. Se a
        regra não estiver visível, ninguém confere se ela está sendo cumprida.
      */}
      <p className="text-sm text-muted-foreground">
        Entradas e tentativas de acesso são apagadas automaticamente após 90 dias. Alterações de
        conteúdo ficam guardadas por 2 anos.
      </p>
    </div>
  );
}
