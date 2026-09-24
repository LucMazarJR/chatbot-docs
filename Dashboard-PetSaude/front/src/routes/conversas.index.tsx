import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Star } from "lucide-react";

import { GateShell } from "@/components/gate";
import { getFilaCuradoria } from "@/lib/curadoria.functions";
import { exigirAdmin } from "@/lib/guardas";
import {
  getEstatisticasConversas,
  listarConversas,
  type ConversaResumida,
  type EstatisticasConversas,
  type Periodo,
  type Situacao,
} from "@/lib/conversas.functions";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Segmentos } from "@/components/segmentos";
import { Selo, type TomDoSelo } from "@/components/selo";
import { SeloConta } from "@/components/selos-conversa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataPorExtenso, diaEHora, diaIso } from "@/lib/datas";

type Busca = { periodo?: Periodo; dia?: string; situacao?: Situacao };

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/conversas/")({
  beforeLoad: () => exigirAdmin(),
  // Só devolve o que difere do padrão: devolvendo tudo, o router responde 307
  // em toda visita.
  validateSearch: (search: Record<string, unknown>): Busca => ({
    ...(search.periodo && search.periodo !== "tudo" ? { periodo: search.periodo as Periodo } : {}),
    ...(typeof search.dia === "string" && FORMATO_DIA.test(search.dia) ? { dia: search.dia } : {}),
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
  { valor: "dia", rotulo: "Um dia" },
  { valor: "tudo", rotulo: "Tudo" },
];

const SITUACOES: { valor: Situacao; rotulo: string; titulo?: string }[] = [
  { valor: "validas", rotulo: "Com interação" },
  { valor: "negativos", rotulo: "Voto negativo" },
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
  const situacao = busca.situacao ?? "validas";
  // "Um dia" sem data escolhida mostra hoje: é o caso de quem abre a tela no
  // fim de um teste presencial para rever as conversas do dia.
  const hoje = diaIso(new Date());
  const dia = periodo === "dia" ? (busca.dia ?? hoje) : undefined;

  const estatisticas = useQuery({
    queryKey: ["conversas-estatisticas", { periodo, dia }],
    queryFn: () => getEstatisticasConversas({ data: { periodo, dia } }),
  });

  const conversas = useQuery({
    queryKey: ["conversas", { periodo, dia, situacao }],
    queryFn: () => listarConversas({ data: { periodo, dia, situacao } }),
  });

  const lista = conversas.data ?? [];

  return (
    <GateShell>
      <div className="space-y-5">
        <CabecalhoPagina
          titulo="Conversas"
          frase="O que as pessoas perguntaram ao chatbot e como foram as respostas."
        />

        {/* Os números surgiam do nada e empurravam a lista para baixo: o
            espaço fica reservado pelo sinal de carregamento. */}
        {estatisticas.data ? (
          <Numeros dados={estatisticas.data} />
        ) : estatisticas.isError ? (
          <EstadoFalha
            onTentarDeNovo={() => estatisticas.refetch()}
            tentando={estatisticas.isFetching}
          >
            Não foi possível calcular os números. Confira a internet e tente de novo.
          </EstadoFalha>
        ) : (
          <Carregando compacto texto="Calculando os números…" />
        )}

        {/* Dois recortes, cada um no seu trilho: quando, e o que aconteceu. */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmentos
            rotulo="Período"
            opcoes={PERIODOS}
            valor={periodo}
            aoMudar={(valor) =>
              navigate({
                search: (a) => ({ ...a, periodo: valor, dia: valor === "dia" ? a.dia : undefined }),
              })
            }
          />
          {periodo === "dia" && (
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-dia">Dia</Label>
              <Input
                id="filtro-dia"
                type="date"
                className="w-auto"
                value={dia}
                max={hoje}
                onChange={(e) => {
                  // Apagar a data no campo volta para hoje, em vez de filtrar por nada.
                  const escolhido = e.target.value;
                  navigate({
                    search: (a) => ({ ...a, dia: FORMATO_DIA.test(escolhido) ? escolhido : undefined }),
                  });
                }}
              />
            </div>
          )}
          <Segmentos
            rotulo="Situação"
            opcoes={SITUACOES}
            valor={situacao}
            aoMudar={(valor) => navigate({ search: (a) => ({ ...a, situacao: valor }) })}
          />
        </div>

        {conversas.isError ? (
          <EstadoFalha onTentarDeNovo={() => conversas.refetch()} tentando={conversas.isFetching}>
            Não foi possível carregar as conversas. Confira a internet e tente de novo.
          </EstadoFalha>
        ) : conversas.isLoading ? (
          <Carregando texto="Carregando as conversas…" />
        ) : lista.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma conversa com esses filtros"
            acao={
              periodo !== "tudo" || situacao !== "validas" ? (
                <Button variant="outline" onClick={() => navigate({ search: {} })}>
                  Ver todas as conversas
                </Button>
              ) : undefined
            }
          >
            {periodo === "hoje" || (periodo === "dia" && dia === hoje)
              ? "Ninguém conversou com o chatbot hoje ainda."
              : periodo === "dia" && dia
                ? `Ninguém conversou com o chatbot em ${dataPorExtenso(`${dia}T12:00:00-03:00`)}. Escolha outro dia no campo acima.`
                : "Troque o período ou a situação para ver outras."}
          </EstadoVazio>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1.3fr)_130px_100px_90px_minmax(0,1fr)_20px] gap-4 border-b border-border px-5 py-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid"
            >
              <span>Participante</span>
              <span>Quando</span>
              <span>Perguntas</span>
              <span>Nota</span>
              <span>Situação</span>
              <span />
            </div>
            <ul aria-label="Conversas">
              {lista.map((conversa) => (
                <LinhaConversa key={conversa._id} conversa={conversa} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </GateShell>
  );
}

/**
 * A situação da conversa em uma palavra, pela ordem do que mais pede atenção.
 *
 * Antes cada conversa trazia até sete pílulas ("2 ruim", "1 boa", "até 45s"),
 * e ler a lista era ler todas. O selo diz o principal; o detalhe está na
 * conversa aberta.
 */
function situacaoDe(c: ConversaResumida): { texto: string; tom: TomDoSelo } {
  if (c.erros > 0) return { texto: c.erros === 1 ? "Falhou" : `${c.erros} falharam`, tom: "erro" };
  if (c.negativos > 0) return { texto: "Voto negativo", tom: "erro" };
  if (c.semResposta > 0) return { texto: "Sem resposta", tom: "atencao" };
  if (c.qtdPerguntas === 0) return { texto: "Sem interação", tom: "neutro" };
  if (c.avaliacao) return { texto: "Avaliada", tom: "sucesso" };
  return { texto: "Respondida", tom: "neutro" };
}

function LinhaConversa({ conversa }: { conversa: ConversaResumida }) {
  const situacao = situacaoDe(conversa);
  const estrelas = conversa.avaliacao?.estrelas;
  const lenta = conversa.latenciaMaxima != null && conversa.latenciaMaxima >= 30_000;
  const perguntas = `${conversa.qtdPerguntas} ${conversa.qtdPerguntas === 1 ? "pergunta" : "perguntas"}`;

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to="/conversas/$id"
        params={{ id: conversa._id }}
        className="grid min-h-[60px] grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-[15px] text-foreground transition-colors hover:bg-surface-2 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_130px_100px_90px_minmax(0,1fr)_20px] lg:py-0"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <strong className="font-semibold">{conversa.nome}</strong>
          <SeloConta usuarioId={conversa.usuarioId} />
        </span>
        <ChevronRight
          aria-hidden="true"
          className="row-span-2 size-[18px] text-muted-foreground lg:order-last lg:row-span-1"
        />
        {/* No celular, quando, perguntas, nota e situação viram uma linha só. */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground lg:contents lg:text-[15px]">
          <span>{diaEHora(conversa.iniciadaEm)}</span>
          <span className="text-foreground lg:text-[15px]">
            <span className="lg:hidden">{perguntas}</span>
            <span className="hidden lg:inline">{conversa.qtdPerguntas}</span>
          </span>
          {estrelas != null ? (
            <span className="flex items-center gap-1 text-foreground">
              <Star aria-hidden="true" className="size-[15px] fill-warning text-warning" />
              <span className="sr-only">Nota </span>
              {estrelas}
            </span>
          ) : (
            <span>sem nota</span>
          )}
          <span className="flex flex-wrap gap-1.5">
            <Selo tom={situacao.tom}>{situacao.texto}</Selo>
            {lenta && (
              <Selo tom="atencao">até {Math.round((conversa.latenciaMaxima ?? 0) / 1000)} s</Selo>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Quatro números, cada um com o contexto que o torna legível.
 *
 * LÓGICA DO LUCIANO: eram dez cartões iguais em três grupos, e um número solto
 * ("84") não diz se é bom ou ruim. Cada cartão agora responde a uma pergunta
 * (quanto usaram, se gostaram, onde faltou resposta, se aguentou) e traz na
 * linha de baixo o que dá sentido ao número. Só o que pede atenção ganha cor.
 */
function Numeros({ dados }: { dados: EstatisticasConversas }) {
  const fila = useQuery({ queryKey: ["curadoria-fila"], queryFn: () => getFilaCuradoria() });
  const pendentes = fila.data?.pendentes ?? 0;
  const semResposta = dados.percentualSemResposta;
  const segundos = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        <CartaoNumero
          rotulo="Conversas"
          valor={dados.sessoes.toLocaleString("pt-BR")}
          contexto={`${dados.respostas.toLocaleString("pt-BR")} perguntas feitas`}
        />
        <CartaoNumero
          rotulo="Nota média"
          valor={dados.notaMedia ? dados.notaMedia.toFixed(1).replace(".", ",") : "sem nota"}
          contexto={
            `${dados.sessoesAvaliadas} ${dados.sessoesAvaliadas === 1 ? "avaliação" : "avaliações"}, de 1 a 5` +
            (dados.npsScore != null ? ` · NPS ${dados.npsScore}` : "")
          }
        />
        <CartaoNumero
          rotulo="Sem resposta"
          valor={semResposta != null ? `${semResposta.toFixed(0)}%` : "nenhuma"}
          tom={(semResposta ?? 0) >= 30 ? "warning" : undefined}
          contexto={
            // A lacuna vira tarefa: o número vem com o caminho para a fila.
            pendentes > 0 ? (
              <Link to="/curadoria" className="text-foreground underline underline-offset-2 hover:text-primary">
                {pendentes} {pendentes === 1 ? "espera" : "esperam"} análise na fila
              </Link>
            ) : (
              "das perguntas feitas"
            )
          }
        />
        <CartaoNumero
          rotulo="Falhas"
          valor={dados.erros.toLocaleString("pt-BR")}
          tom={dados.erros > 0 ? "destructive" : undefined}
          contexto={
            dados.latenciaMedia
              ? `tempo médio de resposta: ${segundos(dados.latenciaMedia)}` +
                (dados.respostasLentas > 0 ? ` · ${dados.respostasLentas} acima de 30 s` : "")
              : "sem respostas no período"
          }
        />
      </div>

      {/* Dito em voz baixa, mas dito: sem isto alguém compara o total daqui com
          o número de links distribuídos e conclui que sumiram sessões. */}
      {dados.sessoesVazias > 0 && (
        <p className="text-sm text-muted-foreground">
          {dados.sessoesVazias}{" "}
          {dados.sessoesVazias === 1 ? "visita não entrou" : "visitas não entraram"} nos números:
          abriram a página e saíram sem perguntar nada. Aparecem na situação “Todas”.
        </p>
      )}
    </div>
  );
}

function CartaoNumero({
  rotulo,
  valor,
  contexto,
  tom,
}: {
  rotulo: string;
  valor: string;
  contexto: React.ReactNode;
  tom?: "warning" | "destructive";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 lg:px-5 lg:py-[18px]">
      <span className="text-sm font-medium text-muted-foreground">{rotulo}</span>
      <strong
        className={
          "text-[26px] font-semibold leading-tight tabular-nums lg:text-[32px] " +
          (tom === "warning" ? "text-warning" : tom === "destructive" ? "text-destructive" : "")
        }
      >
        {valor}
      </strong>
      <span className="text-sm text-muted-foreground">{contexto}</span>
    </div>
  );
}
