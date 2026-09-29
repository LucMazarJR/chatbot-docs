import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Download, FileBarChart } from "lucide-react";
import { toast } from "sonner";

import { GateShell } from "@/components/gate";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { CartaoNumero } from "@/components/cartao-numero";
import { Carregando } from "@/components/carregando";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Segmentos } from "@/components/segmentos";
import { Selo } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { exigirAdmin } from "@/lib/guardas";
import { dataEHora, dataPorExtenso, hora } from "@/lib/datas";
import {
  COR_DA_BARRA,
  ORDEM_DAS_CAUSAS,
  ROTULO_CAUSA,
  ROTULO_PUBLICO,
  ROTULO_SITUACAO,
  TOM_SITUACAO,
  percentual,
  plural,
  segundos,
} from "@/lib/relatorio-rotulos";
import {
  detalharRelatorio,
  gerarRelatorio,
  listarRelatorios,
  type PerguntaDoRelatorio,
  type RelatorioDoDia,
  type RelatorioResumido,
} from "@/lib/relatorios.functions";

type Busca = { id?: string };

export const Route = createFileRoute("/relatorios")({
  beforeLoad: () => exigirAdmin(),
  validateSearch: (search: Record<string, unknown>): Busca =>
    typeof search.id === "string" && search.id ? { id: search.id } : {},
  head: () => ({
    meta: [
      { title: "Relatório do dia | Central de FAQs" },
      {
        name: "description",
        content: "Números do chatbot num dia e a análise de cada pergunta, feita por IA.",
      },
    ],
  }),
  component: RelatoriosPage,
});

/** Hoje, AAAA-MM-DD, no fuso da equipe: é o valor que o campo de data entende. */
function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** O dia do relatório por extenso. Meio-dia de Brasília, para o fuso não trocar o dia. */
function diaPorExtenso(data: string): string {
  return dataPorExtenso(`${data}T12:00:00-03:00`);
}

function RelatoriosPage() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const gerar = useServerFn(gerarRelatorio);
  const [dia, setDia] = useState(hojeEmBrasilia);

  const lista = useQuery({ queryKey: ["relatorios"], queryFn: () => listarRelatorios() });

  // Sem escolha na URL, abre o mais recente: quem entra aqui quer ver o
  // último relatório, e não uma tela vazia pedindo para escolher.
  const selecionadoId = busca.id ?? lista.data?.[0]?.id ?? null;

  const detalhe = useQuery({
    queryKey: ["relatorio", selecionadoId],
    queryFn: () => detalharRelatorio({ data: { id: selecionadoId! } }),
    enabled: Boolean(selecionadoId),
    // Só enquanto a análise roda: fora disso, consultar a cada 2 s é tráfego
    // sem informação nova.
    refetchInterval: (query) => (query.state.data?.estado === "rodando" ? 2000 : false),
  });

  const estadoAtual = detalhe.data?.estado;
  useEffect(() => {
    // A lista mostra o estado de cada relatório e não sabe sozinha que a
    // análise terminou.
    if (estadoAtual && estadoAtual !== "rodando") {
      void queryClient.invalidateQueries({ queryKey: ["relatorios"] });
    }
  }, [estadoAtual, queryClient]);

  const disparar = useMutation({
    mutationFn: (data: string) => gerar({ data: { data } }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["relatorios"] });
      void navigate({ search: { id } });
    },
    onError: (erro: Error) =>
      toast.error(
        erro.message || "Não foi possível começar o relatório. Confira a internet e tente de novo.",
      ),
  });

  const rodando = detalhe.data?.estado === "rodando" || disparar.isPending;

  return (
    <GateShell>
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="Relatório do dia"
          frase="Números do chatbot num dia e a análise de cada pergunta, feita por IA."
          acoes={
            <form
              className="flex flex-wrap items-end gap-2.5"
              onSubmit={(evento) => {
                evento.preventDefault();
                if (!dia) {
                  toast.info("Escolha o dia do relatório.");
                  return;
                }
                disparar.mutate(dia);
              }}
            >
              <div className="grid gap-1">
                <Label htmlFor="dia-do-relatorio" className="text-sm text-muted-foreground">
                  Dia
                </Label>
                <Input
                  id="dia-do-relatorio"
                  type="date"
                  value={dia}
                  max={hojeEmBrasilia()}
                  onChange={(evento) => setDia(evento.target.value)}
                  className="min-h-11 w-[170px] sm:min-h-9"
                />
              </div>
              <Button type="submit" disabled={rodando} className="min-h-11 sm:min-h-9">
                <FileBarChart />
                {rodando ? "Gerando…" : "Gerar relatório"}
              </Button>
            </form>
          }
        />

        {lista.isError ? (
          <EstadoFalha onTentarDeNovo={() => lista.refetch()} tentando={lista.isFetching}>
            Não foi possível carregar os relatórios. Confira a internet e tente de novo.
          </EstadoFalha>
        ) : lista.isLoading ? (
          <Carregando texto="Carregando os relatórios…" />
        ) : !selecionadoId ? (
          <EstadoVazio titulo="Nenhum relatório gerado ainda">
            Escolha o dia e toque em Gerar relatório. A análise leva de meio minuto a dois minutos.
          </EstadoVazio>
        ) : detalhe.isError ? (
          <EstadoFalha onTentarDeNovo={() => detalhe.refetch()} tentando={detalhe.isFetching}>
            {detalhe.error instanceof Error && detalhe.error.message
              ? detalhe.error.message
              : "Não foi possível abrir o relatório. Confira a internet e tente de novo."}
          </EstadoFalha>
        ) : !detalhe.data ? (
          <Carregando texto="Abrindo o relatório…" />
        ) : (
          <VisaoDoRelatorio
            relatorio={detalhe.data}
            aoGerarDeNovo={() => disparar.mutate(detalhe.data!.data)}
            gerando={disparar.isPending}
          />
        )}

        {lista.data && lista.data.length > 0 && (
          <ListaDeRelatorios
            relatorios={lista.data}
            selecionadoId={selecionadoId}
            aoEscolher={(id) => void navigate({ search: { id } })}
          />
        )}
      </div>
    </GateShell>
  );
}

function VisaoDoRelatorio({
  relatorio,
  aoGerarDeNovo,
  gerando,
}: {
  relatorio: RelatorioDoDia;
  aoGerarDeNovo: () => void;
  gerando: boolean;
}) {
  const [baixando, setBaixando] = useState(false);
  const n = relatorio.numeros;
  const concluido = relatorio.estado === "concluido";

  async function baixarPdf() {
    setBaixando(true);
    try {
      // Carregada só aqui: a biblioteca de PDF pesa perto de 1 MB.
      const { baixarRelatorioEmPdf } = await import("@/lib/pdf/relatorio-pdf");
      await baixarRelatorioEmPdf(relatorio);
      toast.success("PDF baixado. Ele está na pasta de downloads do navegador.");
    } catch {
      toast.error(
        "Não foi possível montar o PDF. Tente de novo; se continuar, recarregue a página.",
      );
    } finally {
      setBaixando(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="titulo-relatorio">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="titulo-relatorio" className="text-xl font-semibold">
            {diaPorExtenso(relatorio.data)}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pedido por {relatorio.atorNome} em {dataEHora(relatorio.iniciadoEm)}
            {relatorio.modelo ? ` · IA: ${relatorio.modelo}` : ""}
          </p>
        </div>
        {concluido && n && n.perguntas > 0 && (
          <Button
            variant="outline"
            onClick={() => void baixarPdf()}
            disabled={baixando}
            className="min-h-11 sm:min-h-9"
          >
            <Download />
            {baixando ? "Montando o PDF…" : "Baixar PDF"}
          </Button>
        )}
      </div>

      {relatorio.estado === "rodando" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <Carregando
            compacto
            texto={
              n
                ? `Analisando as ${n.perguntas} perguntas do dia com IA. Leva de meio minuto a dois minutos.`
                : "Juntando as perguntas do dia…"
            }
          />
          {relatorio.andamento && relatorio.andamento.total > 1 && (
            <Progress
              value={Math.round((relatorio.andamento.processados / relatorio.andamento.total) * 100)}
              className="mt-2"
              aria-label="Andamento da análise"
            />
          )}
        </div>
      )}

      {(relatorio.estado === "erro" ||
        relatorio.estado === "cota_esgotada" ||
        relatorio.estado === "interrompido") && (
        <EstadoFalha onTentarDeNovo={aoGerarDeNovo} tentando={gerando}>
          {relatorio.erro ?? "A análise não terminou. Gere o relatório de novo."}
        </EstadoFalha>
      )}

      {/* Os números são contados antes da IA: aparecem mesmo quando a análise
          falhou, e não dependem dela. */}
      {n && n.perguntas === 0 && relatorio.estado !== "rodando" ? (
        <EstadoVazio titulo="Nenhuma pergunta neste dia">
          O chatbot não recebeu perguntas em {diaPorExtenso(relatorio.data)}. Escolha outro dia.
        </EstadoVazio>
      ) : (
        n && (
          <>
            <Numeros relatorio={relatorio} />
            {concluido && (
              <>
                {relatorio.resumo && (
                  <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                    <h3 className="text-base font-semibold">Resumo</h3>
                    <p className="mt-2 max-w-prose text-[15px] leading-relaxed">{relatorio.resumo}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Escrito pela IA. Os números acima são contados pelo sistema.
                    </p>
                  </section>
                )}
                <Causas relatorio={relatorio} />
                <BarrasPorArea relatorio={relatorio} />
                <Escopos relatorio={relatorio} />
                <Comentarios relatorio={relatorio} />
                <Perguntas relatorio={relatorio} />
              </>
            )}
          </>
        )
      )}
    </section>
  );
}

function Numeros({ relatorio }: { relatorio: RelatorioDoDia }) {
  const n = relatorio.numeros!;
  const taxaSemResposta = n.perguntas ? n.semResposta / n.perguntas : 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        <CartaoNumero
          rotulo="Perguntas"
          valor={n.perguntas.toLocaleString("pt-BR")}
          contexto={`em ${plural(n.conversas, "conversa", "conversas")}`}
        />
        <CartaoNumero
          rotulo="Respondidas"
          valor={percentual(n.respondidas, n.perguntas)}
          contexto={`${n.respondidas} de ${n.perguntas}`}
        />
        <CartaoNumero
          rotulo="Sem resposta"
          valor={percentual(n.semResposta, n.perguntas)}
          tom={taxaSemResposta >= 0.3 ? "warning" : undefined}
          contexto={plural(n.semResposta, "pergunta", "perguntas")}
        />
        <CartaoNumero
          rotulo="Tempo de resposta"
          valor={n.latenciaMediana != null ? segundos(n.latenciaMediana) : "sem dado"}
          tom={n.respostasAcimaDe60s > 0 ? "warning" : undefined}
          contexto={
            n.latenciaP90 != null
              ? `9 em cada 10 em até ${segundos(n.latenciaP90)} · ${n.respostasAcimaDe60s} acima de 60 s`
              : "sem respostas medidas"
          }
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {plural(n.positivos, "voto positivo", "votos positivos")} e{" "}
        {plural(n.negativos, "negativo", "negativos")} nas respostas.{" "}
        {n.avaliacoes > 0
          ? `${plural(n.avaliacoes, "avaliação", "avaliações")} no fim da conversa` +
            (n.notaMedia != null ? `, nota média ${n.notaMedia.toFixed(1).replace(".", ",")} de 5` : "") +
            (n.npsMedio != null
              ? `, recomendação média ${n.npsMedio.toFixed(1).replace(".", ",")} de 10`
              : "") +
            "."
          : "Nenhuma avaliação no fim da conversa."}
        {n.falhas + n.semRetorno > 0 &&
          ` ${plural(n.falhas + n.semRetorno, "resposta falhou", "respostas falharam")}.`}
        {n.aceitaramSemPerguntar > 0 &&
          ` ${plural(n.aceitaramSemPerguntar, "pessoa aceitou", "pessoas aceitaram")} os termos e não fez pergunta nenhuma.`}
      </p>
    </div>
  );
}

function Causas({ relatorio }: { relatorio: RelatorioDoDia }) {
  const linhas = ORDEM_DAS_CAUSAS.map((causa) => ({
    causa,
    n: relatorio.porCausa[causa] ?? 0,
  })).filter((l) => l.n > 0);
  if (linhas.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">O que aconteceu com as que não foram bem</h3>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {linhas.map((l) => (
          <li
            key={l.causa}
            className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="text-[15px]">{ROTULO_CAUSA[l.causa]}</span>
            <strong className="text-xl font-semibold">{l.n}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PARTES_DA_BARRA = [
  { chave: "respondidas", rotulo: "Respondidas", cor: COR_DA_BARRA.respondidas },
  { chave: "semResposta", rotulo: "Sem resposta", cor: COR_DA_BARRA.semResposta },
  { chave: "falhas", rotulo: "Falharam", cor: COR_DA_BARRA.falhas },
] as const;

/**
 * Barras empilhadas por área.
 *
 * Os números de cada área ficam escritos ao lado da barra: a barra mostra a
 * proporção de relance, o texto é o que se lê e o que o leitor de tela anuncia.
 * A cor nunca é a única pista.
 */
function BarrasPorArea({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.porArea.length === 0) return null;
  const maior = Math.max(...relatorio.porArea.map((a) => a.total));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Perguntas por área</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
          {PARTES_DA_BARRA.map((parte) => (
            <li key={parte.chave} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 rounded-[3px]"
                style={{ backgroundColor: parte.cor }}
              />
              {parte.rotulo}
            </li>
          ))}
        </ul>
      </div>

      <ul className="space-y-3">
        {relatorio.porArea.map((area) => (
          <li
            key={area.area}
            className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,13rem)] sm:items-center sm:gap-4"
          >
            <span className="text-[15px] font-medium">{area.area}</span>
            <div aria-hidden="true" className="flex h-3" style={{ width: `${(area.total / maior) * 100}%` }}>
              <div className="flex w-full gap-[2px]">
                {PARTES_DA_BARRA.filter((parte) => area[parte.chave] > 0).map((parte, i, visiveis) => (
                  <div
                    key={parte.chave}
                    title={`${parte.rotulo}: ${area[parte.chave]} de ${area.total}`}
                    className={i === visiveis.length - 1 ? "rounded-r-[4px]" : ""}
                    style={{ flexGrow: area[parte.chave], flexBasis: 0, backgroundColor: parte.cor }}
                  />
                ))}
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {plural(area.total, "pergunta", "perguntas")}
              {area.semResposta > 0 && `, ${area.semResposta} sem resposta`}
              {area.falhas > 0 && `, ${area.falhas} falharam`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Escopos({ relatorio }: { relatorio: RelatorioDoDia }) {
  if (relatorio.escopos.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Temas para revisar na base</h3>
      <ol className="space-y-3">
        {relatorio.escopos.map((escopo, i) => (
          <li key={`${escopo.tema}-${i}`} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="text-base font-semibold">
                {i + 1}. {escopo.tema}
              </strong>
              <span className="text-sm text-muted-foreground">
                {plural(escopo.perguntas.length, "pergunta", "perguntas")}
              </span>
            </div>
            {escopo.motivo && <p className="mt-2 text-[15px]">{escopo.motivo}</p>}
            {escopo.sugestao && (
              <p className="mt-2 text-[15px]">
                <span className="font-semibold">O que fazer: </span>
                {escopo.sugestao}
              </p>
            )}
            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary sm:min-h-0">
                Ver as perguntas
              </summary>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {escopo.perguntas.map((indice) => {
                  const p = relatorio.perguntas[indice];
                  return p ? <li key={indice}>“{p.pergunta}”</li> : null;
                })}
              </ul>
            </details>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        Temas levantados pela IA. Para transformar em FAQ, use a tela{" "}
        <Link to="/curadoria" className="text-foreground underline underline-offset-2 hover:text-primary">
          Sem resposta
        </Link>
        .
      </p>
    </section>
  );
}

function Comentarios({ relatorio }: { relatorio: RelatorioDoDia }) {
  const comentarios = relatorio.numeros?.comentarios ?? [];
  if (comentarios.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold">O que escreveram na avaliação</h3>
      <ul className="space-y-1.5">
        {comentarios.map((comentario, i) => (
          <li key={i} className="rounded-lg bg-muted px-3 py-2 text-[15px]">
            “{comentario}”
          </li>
        ))}
      </ul>
    </section>
  );
}

type FiltroPerguntas = "sem-resposta" | "revisar" | "todas";

function Perguntas({ relatorio }: { relatorio: RelatorioDoDia }) {
  const semResposta = relatorio.perguntas.filter((p) => p.situacao !== "respondida");
  const [filtro, setFiltro] = useState<FiltroPerguntas>(
    semResposta.length > 0 ? "sem-resposta" : "todas",
  );

  const visiveis = useMemo(() => {
    if (filtro === "sem-resposta") return semResposta;
    if (filtro === "revisar") return relatorio.perguntas.filter((p) => p.causa === "respondida_revisar");
    return relatorio.perguntas;
  }, [filtro, relatorio.perguntas, semResposta]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Cada pergunta do dia</h3>
        <Segmentos
          rotulo="Quais perguntas mostrar"
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: "sem-resposta", rotulo: `Não foram bem (${semResposta.length})` },
            {
              valor: "revisar",
              rotulo: `Respondidas para revisar (${relatorio.perguntas.filter((p) => p.causa === "respondida_revisar").length})`,
            },
            { valor: "todas", rotulo: `Todas (${relatorio.perguntas.length})` },
          ]}
        />
      </div>

      {visiveis.length === 0 ? (
        <EstadoVazio titulo="Nenhuma pergunta neste filtro">
          Escolha outro filtro acima para ver as demais perguntas do dia.
        </EstadoVazio>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visiveis.map((p) => (
            <LinhaPergunta key={p.perguntaId} pergunta={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaPergunta({ pergunta }: { pergunta: PerguntaDoRelatorio }) {
  return (
    <li className="space-y-1.5 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{hora(pergunta.em)}</span>
        <span aria-hidden="true">·</span>
        <Link
          to="/conversas/$id"
          params={{ id: pergunta.sessaoId }}
          className="text-foreground underline underline-offset-2 hover:text-primary"
        >
          {pergunta.participante}
        </Link>
        {pergunta.feedback && (
          <>
            <span aria-hidden="true">·</span>
            <span>{pergunta.feedback === "up" ? "voto positivo" : "voto negativo"}</span>
          </>
        )}
      </div>
      <p className="text-[15px] font-semibold">{pergunta.pergunta}</p>
      <div className="flex flex-wrap gap-1.5">
        <Selo tom={TOM_SITUACAO[pergunta.situacao]}>{ROTULO_SITUACAO[pergunta.situacao]}</Selo>
        {pergunta.area && <Selo>{pergunta.area}</Selo>}
        {pergunta.publico && pergunta.publico !== "cidadao" && (
          <Selo tom="marca">{ROTULO_PUBLICO[pergunta.publico]}</Selo>
        )}
      </div>
      {(pergunta.comentario || (pergunta.causa && pergunta.causa !== "respondida")) && (
        <p className="text-sm text-muted-foreground">
          {pergunta.causa && pergunta.causa !== "respondida" && (
            <span className="font-semibold text-foreground">{ROTULO_CAUSA[pergunta.causa]}. </span>
          )}
          {pergunta.comentario}
        </p>
      )}
    </li>
  );
}

const ROTULO_ESTADO: Record<RelatorioResumido["estado"], string> = {
  rodando: "Gerando",
  concluido: "Pronto",
  erro: "Não terminou",
  cota_esgotada: "Cota esgotada",
  interrompido: "Interrompido",
};

function ListaDeRelatorios({
  relatorios,
  selecionadoId,
  aoEscolher,
}: {
  relatorios: RelatorioResumido[];
  selecionadoId: string | null;
  aoEscolher: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Relatórios gerados</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {relatorios.map((r) => {
          const aberto = r.id === selecionadoId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => aoEscolher(r.id)}
                aria-current={aberto ? "true" : undefined}
                className={
                  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5 " +
                  (aberto ? "bg-primary-soft/60" : "")
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{diaPorExtenso(r.data)}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.perguntas != null
                      ? `${plural(r.perguntas, "pergunta", "perguntas")}, ${r.semResposta ?? 0} sem resposta`
                      : "Sem números"}{" "}
                    · pedido por {r.atorNome} em {dataEHora(r.iniciadoEm)}
                  </p>
                </div>
                <Selo
                  tom={
                    r.estado === "concluido" ? "sucesso" : r.estado === "rodando" ? "marca" : "erro"
                  }
                >
                  {ROTULO_ESTADO[r.estado]}
                </Selo>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
