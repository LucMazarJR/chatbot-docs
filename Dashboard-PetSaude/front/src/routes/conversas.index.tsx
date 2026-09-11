import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react";

import { GateShell } from "@/components/gate";
import { getFilaCuradoria } from "@/lib/curadoria.functions";
import { exigirAdmin } from "@/lib/guardas";
import {
  getEstatisticasConversas,
  listarConversas,
  type ConversaResumida,
  type EstatisticasConversas,
  type FiltroVersao,
  type Periodo,
  type Situacao,
} from "@/lib/conversas.functions";

type Busca = { periodo?: Periodo; versao?: FiltroVersao; situacao?: Situacao };

export const Route = createFileRoute("/conversas/")({
  beforeLoad: () => exigirAdmin(),
  // Só devolve o que difere do padrão: devolvendo tudo, o router responde 307
  // em toda visita.
  validateSearch: (search: Record<string, unknown>): Busca => ({
    ...(search.periodo && search.periodo !== "tudo" ? { periodo: search.periodo as Periodo } : {}),
    ...(search.versao && search.versao !== "todas" ? { versao: search.versao as FiltroVersao } : {}),
    ...(search.situacao && search.situacao !== "validas"
      ? { situacao: search.situacao as Situacao }
      : {}),
  }),
  head: () => ({
    meta: [{ title: "Conversas do chatbot | Central de FAQs" }],
  }),
  component: ConversasPage,
});

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

const VERSOES: { valor: FiltroVersao; rotulo: string }[] = [
  { valor: "todas", rotulo: "A + B" },
  { valor: "a", rotulo: "Versão A" },
  { valor: "b", rotulo: "Versão B" },
];

const SITUACOES: { valor: Situacao; rotulo: string; titulo?: string }[] = [
  { valor: "validas", rotulo: "Com interação" },
  { valor: "negativos", rotulo: "Resposta ruim" },
  { valor: "nota-baixa", rotulo: "Nota ≤ 3" },
  { valor: "sem-resposta", rotulo: "Não encontrou" },
  { valor: "com-erro", rotulo: "Falhou" },
  {
    valor: "todas",
    rotulo: "Todas",
    titulo: "Inclui visitas que abriram a página e saíram sem perguntar nada",
  },
];

function ConversasPage() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();

  const periodo = busca.periodo ?? "tudo";
  const versao = busca.versao ?? "todas";
  const situacao = busca.situacao ?? "validas";

  const estatisticas = useQuery({
    queryKey: ["conversas-estatisticas", { periodo, versao }],
    queryFn: () => getEstatisticasConversas({ data: { periodo, versao } }),
  });

  const conversas = useQuery({
    queryKey: ["conversas", { periodo, versao, situacao }],
    queryFn: () => listarConversas({ data: { periodo, versao, situacao } }),
  });

  const lista = conversas.data ?? [];

  return (
    <GateShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Conversas do chatbot</h2>
          <p className="text-sm text-muted-foreground">
            O que os participantes perguntaram no protótipo, e de quais perguntas da base cada
            resposta saiu.
          </p>
        </div>

        {/* Os três recortes ficam em grupos rotulados porque respondem a
            perguntas diferentes: quando, qual interface, o que deu errado. */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-border panel-surface p-4">
          <GrupoDeFiltro rotulo="Período">
            {PERIODOS.map(({ valor, rotulo }) => (
              <Chip
                key={valor}
                ativo={periodo === valor}
                onClick={() => navigate({ search: (a) => ({ ...a, periodo: valor }) })}
              >
                {rotulo}
              </Chip>
            ))}
          </GrupoDeFiltro>

          <GrupoDeFiltro rotulo="Interface">
            {VERSOES.map(({ valor, rotulo }) => (
              <Chip
                key={valor}
                ativo={versao === valor}
                onClick={() => navigate({ search: (a) => ({ ...a, versao: valor }) })}
              >
                {rotulo}
              </Chip>
            ))}
          </GrupoDeFiltro>

          <GrupoDeFiltro rotulo="Situação">
            {SITUACOES.map(({ valor, rotulo, titulo }) => (
              <Chip
                key={valor}
                ativo={situacao === valor}
                titulo={titulo}
                onClick={() => navigate({ search: (a) => ({ ...a, situacao: valor }) })}
              >
                {rotulo}
              </Chip>
            ))}
          </GrupoDeFiltro>
        </div>

        <AvisoDaFila />

        {estatisticas.data && <Numeros dados={estatisticas.data} />}

        {conversas.isError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive sm:p-8">
            Não foi possível carregar as conversas. Verifique a conexão e tente recarregar.
          </p>
        ) : conversas.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 sm:p-8 text-center text-sm text-muted-foreground">
            Nenhuma conversa com esses filtros.
          </p>
        ) : (
          <ul className="space-y-3">
            {lista.map((conversa) => (
              <li key={conversa._id}>
                <Link
                  to="/conversas/$id"
                  params={{ id: conversa._id }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border panel-surface p-4 sm:p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <SeloVersao versao={conversa.versao} />
                      {conversa.nome}
                    </span>
                    <Marcas conversa={conversa} />
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GateShell>
  );
}

function GrupoDeFiltro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  ativo,
  titulo,
  onClick,
  children,
}: {
  ativo: boolean;
  titulo?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

/**
 * Quantas perguntas sem resposta esperam análise.
 *
 * LÓGICA DO LUCIANO: fica aqui, e não só na tela da fila, porque esta é a tela
 * que alguém abre para ver como o chatbot foi. "Não encontrou" era um número
 * entre os outros indicadores, e um número não pede nada a ninguém. Com o
 * contador e o caminho ao lado, a lacuna deixa de ser diagnóstico e vira tarefa.
 *
 * Só aparece quando há fila: um aviso permanente de "0 pendentes" é ruído.
 */
function AvisoDaFila() {
  const fila = useQuery({ queryKey: ["curadoria-fila"], queryFn: () => getFilaCuradoria() });

  const pendentes = fila.data?.pendentes ?? 0;
  if (pendentes === 0) return null;

  return (
    <Link
      to="/curadoria"
      className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 transition-colors hover:border-primary/50"
    >
      <span className="flex items-start gap-2 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          <strong>
            {pendentes} {pendentes === 1 ? "pergunta" : "perguntas"} sem resposta
          </strong>{" "}
          {pendentes === 1 ? "aguarda" : "aguardam"} análise
          {fila.data?.prontoParaRodar ? " — já dá para rodar uma rodada" : ""}.
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function SeloVersao({ versao }: { versao?: "a" | "b" }) {
  // Sessões anteriores às duas interfaces não têm o campo: contam como "a",
  // que era a única que existia.
  const letra = (versao ?? "a").toUpperCase();
  return (
    <span
      title={`Interface ${letra}`}
      className={
        "inline-grid size-5 place-items-center rounded text-[10px] font-bold text-white " +
        (versao === "b" ? "bg-[#6b5bd2]" : "bg-primary")
      }
    >
      {letra}
    </span>
  );
}

function Marcas({ conversa }: { conversa: ConversaResumida }) {
  const marcas: { texto: string; tom?: "boa" | "ruim" | "alerta" }[] = [];

  if (conversa.qtdPerguntas === 0) marcas.push({ texto: "sem interação · fora da análise" });
  else
    marcas.push({
      texto: `${conversa.qtdPerguntas} ${conversa.qtdPerguntas === 1 ? "pergunta" : "perguntas"}`,
    });

  if (conversa.avaliacao?.estrelas != null)
    marcas.push({ texto: "★".repeat(conversa.avaliacao.estrelas) });
  if (conversa.avaliacao?.nps != null) marcas.push({ texto: `NPS ${conversa.avaliacao.nps}` });
  if (conversa.negativos > 0) marcas.push({ texto: `${conversa.negativos} ruim`, tom: "ruim" });
  if (conversa.positivos > 0) marcas.push({ texto: `${conversa.positivos} boa`, tom: "boa" });
  if (conversa.semResposta > 0)
    marcas.push({ texto: `${conversa.semResposta} sem resposta`, tom: "alerta" });
  if (conversa.erros > 0) marcas.push({ texto: `${conversa.erros} falhou`, tom: "ruim" });
  if (conversa.latenciaMaxima != null && conversa.latenciaMaxima >= 30_000)
    marcas.push({ texto: `até ${Math.round(conversa.latenciaMaxima / 1000)}s`, tom: "alerta" });

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>{formatarData(conversa.iniciadaEm)}</span>
      {marcas.map(({ texto, tom }) => (
        <span
          key={texto}
          className={
            "rounded-full border px-2 py-0.5 " +
            (tom === "boa"
              ? "border-success/50 text-success"
              : tom === "ruim"
                ? "border-destructive/50 text-destructive"
                : tom === "alerta"
                  ? "border-warning/50 text-warning"
                  : "border-border")
          }
        >
          {texto}
        </span>
      ))}
    </span>
  );
}

/**
 * Os números do topo, agrupados por pergunta.
 *
 * Uma fileira única de dez cartões iguais obriga a ler todos para achar um.
 * Separados por assunto — quanto usaram, se gostaram, se aguentou —, dá para ir
 * direto ao que interessa. Só o que precisa de atenção ganha cor.
 */
function Numeros({ dados }: { dados: EstatisticasConversas }) {
  const grupos: { titulo: string; itens: [string, string, boolean?][] }[] = [
    {
      titulo: "Uso",
      itens: [
        ["Conversas", String(dados.sessoes)],
        ["Perguntas", String(dados.respostas)],
        ["Avaliadas", `${dados.sessoesAvaliadas}/${dados.sessoes}`],
      ],
    },
    {
      titulo: "Qualidade",
      itens: [
        ["Nota média", dados.notaMedia ? `${dados.notaMedia.toFixed(1)} ★` : "—"],
        ["NPS", dados.npsScore != null ? String(dados.npsScore) : "—"],
        [
          "Não encontrou",
          dados.percentualSemResposta != null
            ? `${dados.percentualSemResposta.toFixed(0)}%`
            : "—",
          (dados.percentualSemResposta ?? 0) >= 30,
        ],
      ],
    },
    {
      titulo: "Desempenho",
      itens: [
        [
          "Tempo médio",
          dados.latenciaMedia ? `${(dados.latenciaMedia / 1000).toFixed(1)}s` : "—",
          (dados.latenciaMedia ?? 0) >= 30_000,
        ],
        ["Acima de 30s", String(dados.respostasLentas), dados.respostasLentas > 0],
        ["Falhas", String(dados.erros), dados.erros > 0],
      ],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map(({ titulo, itens }) => (
          <section key={titulo}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {titulo}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {itens.map(([rotulo, valor, alerta]) => (
                <div
                  key={rotulo}
                  className={
                    "rounded-lg border panel-surface p-3 " +
                    (alerta ? "border-warning/60" : "border-border")
                  }
                >
                  <span
                    className={
                      "block text-lg font-semibold tabular-nums " + (alerta ? "text-warning" : "")
                    }
                  >
                    {valor}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{rotulo}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Dito em voz baixa, mas dito: sem isto alguém compara o total daqui com
          o número de links distribuídos e conclui que sumiram sessões. */}
      {dados.sessoesVazias > 0 && (
        <p className="text-xs text-muted-foreground">
          {dados.sessoesVazias}{" "}
          {dados.sessoesVazias === 1 ? "visita não entrou" : "visitas não entraram"} nos números
          acima — abriram a página e saíram sem perguntar nada. Aparecem no filtro “Todas”.
        </p>
      )}
    </div>
  );
}

export function formatarData(valor: string) {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
