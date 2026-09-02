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
import { exigirAdmin } from "@/lib/guardas";

const POR_PAGINA = 25;
const TODOS = "__todos__";

/**
 * O que cada ação significa em português, e a que grupo pertence.
 *
 * LÓGICA DO LUCIANO: o backend grava a ação como identificador estável
 * (`login_recusado`), não como frase. Se a frase fosse gravada, mudar o texto da
 * tela exigiria reescrever o histórico inteiro, e registros antigos ficariam com
 * a redação velha. A tradução mora aqui.
 */
const ACOES: Record<string, { rotulo: string; verbo: string }> = {
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
  const acao = ACOES[registro.action] ?? { rotulo: registro.action, verbo: registro.action };
  const temDetalhe = Boolean(registro.before || registro.after);
  const recusado = registro.status === "negado";

  return (
    <li
      className={
        recusado
          ? "rounded-lg border border-destructive/40 bg-destructive/5 p-4"
          : "rounded-lg border border-border panel-surface p-4"
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {recusado && <ShieldAlert className="size-4 shrink-0 text-destructive" />}
        <strong className="text-sm">{registro.actor_name}</strong>
        <span className="text-sm text-muted-foreground">{acao.verbo}</span>
        {registro.question && (
          <span className="min-w-0 break-words text-sm">“{registro.question}”</span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {new Date(registro.created_at).toLocaleString("pt-BR")}
        </span>
      </div>

      {registro.batch_id && (
        <p className="mt-1 text-xs text-muted-foreground">Parte de uma importação em lote</p>
      )}

      {temDetalhe && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-8 px-2"
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
    ...(de ? { de } : {}),
    ...(ate ? { ate } : {}),
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
      <div>
        <h1 className="text-2xl font-semibold">Histórico</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo que foi criado, alterado ou excluído, e quem fez. Inclui entradas no sistema e
          tentativas recusadas.
        </p>
      </div>

      <section className="rounded-lg border border-border panel-surface">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={filtrosAbertos}
            onClick={() => setFiltrosAbertos((v) => !v)}
          >
            <Filter className="size-4" /> Filtros
            {ativos > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                {ativos}
              </span>
            )}
          </Button>

          {ativos > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={limpar}>
              <X className="size-4" /> Limpar
            </Button>
          )}

          <p className="ml-auto text-sm text-muted-foreground">
            {historico.isLoading ? "Carregando…" : `${historico.data?.total ?? 0} registro(s)`}
          </p>
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
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
          Não foi possível carregar o histórico. Tente recarregar a página.
        </p>
      ) : historico.isLoading && !historico.data ? (
        <p className="text-sm text-muted-foreground">Carregando o histórico…</p>
      ) : itens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground sm:p-8">
          {ativos > 0 ? "Nenhum registro com estes filtros." : "Nada registrado ainda."}
        </p>
      ) : (
        <ul className="space-y-2">
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
      <p className="text-xs text-muted-foreground">
        Entradas e tentativas de acesso são apagadas automaticamente após 90 dias. Alterações de
        conteúdo ficam guardadas por 2 anos.
      </p>
    </div>
  );
}
