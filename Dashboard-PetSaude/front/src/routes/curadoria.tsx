import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  History,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  analisarLacunas,
  aprovarSugestao,
  descartarSugestao,
  detalharRodada,
  getFilaCuradoria,
  getJobCuradoria,
  listarLacunas,
  listarRodadas,
  listarSugestoes,
  type Sugestao,
} from "@/lib/curadoria.functions";
import { FaqFormDialog } from "@/components/faq-shared";
import { GateShell, usePode } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { exigirPermissao } from "@/lib/guardas";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Selo } from "@/components/selo";
import { RodapeDaPagina } from "@/components/rodape-da-pagina";
import { dataEHora } from "@/lib/datas";
import { POR_PAGINA } from "@/lib/paginacao";

/**
 * A pergunta como chegou à curadoria. A frase solta de uma continuação ("como
 * chego lá?") não diz o assunto: quem revisa precisa ver como ela foi entendida
 * e a pergunta que veio antes, senão aprova uma FAQ genérica no lugar da que
 * faltou.
 */
function PerguntaComContexto({
  pergunta,
  entendida,
  anterior,
  destaque = false,
}: {
  pergunta: string;
  entendida: string | null;
  anterior: string | null;
  destaque?: boolean;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className={destaque ? "font-semibold" : undefined}>“{entendida ?? pergunta}”</span>
      {entendida && (
        <span className="block text-sm text-muted-foreground">Escreveu: “{pergunta}”</span>
      )}
      {anterior && (
        <span className="block text-sm text-muted-foreground">Antes, na conversa: {anterior}</span>
      )}
    </span>
  );
}

export const Route = createFileRoute("/curadoria")({
  beforeLoad: () => exigirPermissao("curadoria"),
  head: () => ({
    meta: [
      { title: "Perguntas sem resposta | Central de FAQs" },
      {
        name: "description",
        content: "Perguntas que o chatbot não soube responder, a caminho de virar FAQ.",
      },
    ],
  }),
  component: CuradoriaPage,
});

function CuradoriaPage() {
  const queryClient = useQueryClient();
  const analisar = useServerFn(analisarLacunas);
  // Analisar gasta cota da API, e aprovar grava FAQ: os dois são o editar da
  // área. Quem só vê acompanha a fila e as sugestões.
  const podeDecidir = usePode("curadoria", "editar");
  const aprovar = useServerFn(aprovarSugestao);
  // A sugestão aberta no formulário de FAQ. Um formulário só para a página.
  const [revisando, setRevisando] = useState<Sugestao | null>(null);

  const fila = useQuery({ queryKey: ["curadoria-fila"], queryFn: () => getFilaCuradoria() });
  const [pagina, setPagina] = useState(1);
  const sugestoes = useQuery({
    queryKey: ["curadoria-sugestoes", "pendente", pagina],
    queryFn: () => listarSugestoes({ data: { estado: "pendente", page: pagina, limit: POR_PAGINA } }),
    // Trocar de página mantém os cartões da anterior até os novos chegarem, em
    // vez de piscar o "carregando" e jogar a tela para o topo.
    placeholderData: keepPreviousData,
  });

  // Aprovar ou descartar a última sugestão de uma página a deixa vazia: volta
  // para a anterior em vez de mostrar "nenhuma sugestão" com outras esperando.
  useEffect(() => {
    const dados = sugestoes.data;
    if (dados && dados.itens.length === 0 && dados.page > 1) setPagina(dados.totalPages);
  }, [sugestoes.data]);
  const job = useQuery({
    queryKey: ["curadoria-job"],
    queryFn: () => getJobCuradoria(),
    // Só enquanto há job rodando: fora disso, uma consulta a cada 2s por aba
    // aberta é tráfego sem nenhuma informação nova.
    refetchInterval: (query) => (query.state.data?.estado === "rodando" ? 2000 : false),
  });

  const rodando = job.data?.estado === "rodando";

  // Quando o job termina, o que mudou está na fila e nas sugestões: nenhuma
  // das duas sabe disso sozinha.
  useEffect(() => {
    if (job.data && job.data.estado !== "rodando") {
      void queryClient.invalidateQueries({ queryKey: ["curadoria-fila"] });
      void queryClient.invalidateQueries({ queryKey: ["curadoria-sugestoes"] });
      void queryClient.invalidateQueries({ queryKey: ["curadoria-rodadas"] });
      void queryClient.invalidateQueries({ queryKey: ["curadoria-lacunas"] });
    }
  }, [job.data?.estado, job.data?.id, queryClient]);

  const disparar = useMutation({
    mutationFn: () => analisar({ data: undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["curadoria-job"] });
      toast.success("Análise começou");
    },
    onError: (erro: Error) =>
      toast.error(
        erro.message || "Não foi possível começar a análise. Confira a internet e tente de novo.",
      ),
  });

  const pendentes = fila.data?.pendentes ?? 0;
  const tamanho = fila.data?.tamanhoDaRodada ?? 10;
  const lista = sugestoes.data?.itens ?? [];
  const totalSugestoes = sugestoes.data?.total ?? 0;

  return (
    <GateShell>
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="Perguntas sem resposta"
          frase={
            // O número só com a resposta na mão: "nenhuma pergunta" durante a
            // espera faria a equipe achar que não há trabalho.
            fila.data
              ? pendentes === 0
                ? "Nenhuma pergunta esperando análise."
                : `${pendentes} ${pendentes === 1 ? "pergunta espera" : "perguntas esperam"} análise. A análise roda sozinha quando a fila junta ${tamanho}.`
              : "As perguntas que o chatbot não soube responder, a caminho de virar FAQ."
          }
          acoes={
            podeDecidir && (
              <Button
                onClick={() => {
                  // Fila vazia: o toque explica, em vez de um botão apagado.
                  if (fila.data && pendentes === 0) {
                    toast.info("Não há perguntas na fila para analisar agora.");
                    return;
                  }
                  disparar.mutate();
                }}
                disabled={rodando || disparar.isPending}
              >
                <Sparkles />
                {rodando ? "Analisando…" : "Analisar agora"}
              </Button>
            )
          }
        />

        {fila.isError && (
          <EstadoFalha onTentarDeNovo={() => fila.refetch()} tentando={fila.isFetching}>
            Não foi possível ver quantas perguntas esperam análise. Confira a internet e tente de
            novo.
          </EstadoFalha>
        )}

        {job.data && <Andamento job={job.data} />}

        {podeDecidir && !fila.isLoading && pendentes > 0 && !fila.data?.prontoParaRodar && (
          <p className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4 text-[15px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-[18px] shrink-0" />
            <span>
              Quando a fila juntar {tamanho}, a análise roda sozinha. Para analisar antes, use
              Analisar agora: só que juntar perto de {tamanho} rende mais, porque é vendo várias
              perguntas juntas que dá para perceber que "onde fica a UBS" e "qual o endereço do
              posto" são a mesma FAQ faltando.
            </span>
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Sugestões esperando decisão {totalSugestoes > 0 && `(${totalSugestoes})`}
          </h2>

          {sugestoes.isError ? (
            <EstadoFalha onTentarDeNovo={() => sugestoes.refetch()} tentando={sugestoes.isFetching}>
              Não foi possível carregar as sugestões. Confira a internet e tente de novo.
            </EstadoFalha>
          ) : sugestoes.isLoading || (lista.length === 0 && totalSugestoes > 0) ? (
            // A segunda condição é a página que esvaziou: há sugestões, e o
            // efeito acima já está voltando para uma página que as tem.
            <Carregando texto="Carregando as sugestões…" />
          ) : lista.length === 0 ? (
            <EstadoVazio titulo="Nenhuma sugestão esperando decisão">
              Quando houver perguntas na fila, rode a análise para receber sugestões de FAQ.
            </EstadoVazio>
          ) : (
            <>
              <ul className="space-y-4">
                {lista.map((sugestao) => (
                  <CartaoSugestao
                    key={sugestao.id}
                    sugestao={sugestao}
                    aoRevisar={podeDecidir ? () => setRevisando(sugestao) : undefined}
                  />
                ))}
              </ul>
              <RodapeDaPagina
                pagina={sugestoes.data!.page}
                porPagina={sugestoes.data!.limit}
                quantos={lista.length}
                total={totalSugestoes}
                totalPaginas={sugestoes.data!.totalPages}
                aoMudar={(destino) => {
                  setPagina(destino);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </>
          )}
        </section>

        <FilaBruta />

        <HistoricoDeRodadas />
      </div>

      {podeDecidir && (
        <FaqFormDialog
          // A sugestão pela chave: abrir outra recomeça o formulário do rascunho dela.
          key={revisando?.id ?? "nenhuma"}
          mode="create"
          open={revisando !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setRevisando(null);
          }}
          aprovacao={
            revisando
              ? {
                  inicial: {
                    question: revisando.pergunta,
                    answer: revisando.rascunhoResposta,
                    category: revisando.categoriaSugerida ?? "",
                    tags: revisando.tagsSugeridas ?? [],
                    source: "",
                  },
                  salvar: (dados) =>
                    aprovar({
                      data: { id: revisando.id, ...dados, category: dados.category || undefined },
                    }),
                }
              : undefined
          }
        />
      )}
    </GateShell>
  );
}

/**
 * Toda vez que a análise foi disparada, e com que conteúdo.
 *
 * LÓGICA DO LUCIANO: sem isto, a única marca de que o modelo agiu seria a
 * sugestão que sobreviveu, e sugestão descartada some sem deixar rastro. Quem
 * olhasse depois veria FAQs criadas "pela curadoria" sem conseguir responder a
 * pergunta óbvia: com base em quê?
 *
 * Por isso a rodada mostra a ENTRADA, e não só o resultado: as perguntas ficam
 * copiadas no registro, com as FAQs que a busca tinha devolvido e os scores
 * daquele momento. A base muda e as conversas do protótipo são descartáveis;
 * sem a cópia, a decisão viraria inauditável em poucas semanas.
 */
function HistoricoDeRodadas() {
  const [aberto, setAberto] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const rodadas = useQuery({
    queryKey: ["curadoria-rodadas"],
    queryFn: () => listarRodadas(),
    enabled: aberto,
  });

  const lista = rodadas.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 p-4 text-left"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <History className="size-[18px]" />
          Histórico das análises
        </span>
        {aberto ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {aberto && (
        <div className="border-t border-border p-4">
          {rodadas.isError ? (
            <EstadoFalha onTentarDeNovo={() => rodadas.refetch()} tentando={rodadas.isFetching}>
              Não foi possível carregar o histórico. Confira a internet e tente de novo.
            </EstadoFalha>
          ) : rodadas.isLoading ? (
            <Carregando compacto texto="Carregando o histórico das análises…" />
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">A análise ainda não foi disparada.</p>
          ) : (
            <ul className="space-y-3">
              {lista.map((rodada) => (
                <li key={rodada.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">
                        {dataEHora(rodada.iniciadaEm)} · {rodada.atorNome}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {rodada.perguntas.length}{" "}
                        {rodada.perguntas.length === 1 ? "pergunta" : "perguntas"} ·{" "}
                        {rodada.sugestoesCriadas.length}{" "}
                        {rodada.sugestoesCriadas.length === 1 ? "sugestão" : "sugestões"}
                        {rodada.foraDeEscopo.length > 0 &&
                          ` · ${rodada.foraDeEscopo.length} fora do escopo`}
                        {rodada.modelo && ` · ${rodada.modelo}`}
                      </p>
                      {rodada.erro && (
                        <p className="mt-1 text-sm text-destructive">{rodada.erro}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-expanded={abertaId === rodada.id}
                      className="min-h-11 shrink-0 text-sm font-semibold text-primary hover:underline"
                      onClick={() => setAbertaId(abertaId === rodada.id ? null : rodada.id)}
                    >
                      {abertaId === rodada.id ? "ocultar" : "ver o que foi enviado"}
                    </button>
                  </div>

                  {abertaId === rodada.id && <DetalheDaRodada id={rodada.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DetalheDaRodada({ id }: { id: string }) {
  const rodada = useQuery({
    queryKey: ["curadoria-rodada", id],
    queryFn: () => detalharRodada({ data: { id } }),
  });

  if (rodada.isLoading)
    return <Carregando compacto className="mt-3" texto="Carregando a rodada…" />;
  if (!rodada.data)
    return (
      <EstadoFalha
        className="mt-3"
        onTentarDeNovo={() => rodada.refetch()}
        tentando={rodada.isFetching}
      >
        Não foi possível carregar o que foi enviado nesta rodada. Tente de novo.
      </EstadoFalha>
    );

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <ul className="space-y-2">
        {rodada.data.lacunas.map((lacuna) => (
          <li key={`${lacuna.mensagemId}:${lacuna.parte ?? 0}`} className="text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <PerguntaComContexto
                pergunta={lacuna.pergunta}
                entendida={lacuna.entendida ?? null}
                anterior={lacuna.anterior ?? null}
              />
              <Link
                to="/conversas/$id"
                params={{ id: lacuna.sessaoId }}
                className="shrink-0 text-sm text-primary hover:underline"
              >
                conversa
              </Link>
            </div>
            {lacuna.vizinhas.length > 0 && (
              <ul className="mt-0.5 space-y-0.5">
                {lacuna.vizinhas.map((v, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    <span className="tabular-nums">{v.score.toFixed(3)}</span> ·{" "}
                    {v.question ?? "pergunta sem texto"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-muted-foreground">
          Resposta do modelo, como veio
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
          {rodada.data.respostaBruta || "(vazia)"}
        </pre>
      </details>
    </div>
  );
}

/**
 * O que saiu da rodada, em uma frase.
 *
 * LÓGICA DO LUCIANO: "fora de escopo" aparece junto das sugestões porque é
 * resultado, não descarte silencioso. Nem toda pergunta que o chatbot não
 * respondeu é conteúdo faltando: na primeira fila real havia "qual o melhor
 * time de futebol do brasil?" e "Hoje fiz muita coisa", e nesses o chatbot
 * acertou em não responder. Sem esta linha, a pessoa veria a fila encolher e
 * nenhuma sugestão aparecer, e concluiria que a análise falhou.
 */
function resumoDaAnalise(contadores: Record<string, number>): string {
  const sugestoes = contadores.sugestoes ?? 0;
  const fora = contadores.fora_de_escopo ?? 0;

  const partes = [
    `${sugestoes} ${sugestoes === 1 ? "sugestão" : "sugestões"}`,
    ...(fora > 0
      ? [`${fora} ${fora === 1 ? "pergunta" : "perguntas"} fora do escopo da saúde`]
      : []),
  ];

  return `Análise concluída: ${partes.join(", ")}.`;
}

function Andamento({ job }: { job: NonNullable<Awaited<ReturnType<typeof getJobCuradoria>>> }) {
  const rodando = job.estado === "rodando";
  const pct = job.total > 0 ? Math.round((job.processados / job.total) * 100) : 0;

  return (
    <div role="status" className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">
          {rodando
            ? "Analisando as perguntas da fila…"
            : job.estado === "concluido"
              ? resumoDaAnalise(job.contadores ?? {})
              : "A última análise não terminou"}
        </p>
        <span className="text-sm text-muted-foreground">por {job.atorNome}</span>
      </div>
      {rodando && <Progress value={pct} className="mt-2" />}
      {job.mensagem && (
        <p
          className={`mt-2 text-sm ${job.estado === "concluido" ? "text-muted-foreground" : "text-destructive"}`}
        >
          {job.mensagem}
        </p>
      )}
    </div>
  );
}

/**
 * Uma sugestão do modelo, para decidir.
 *
 * O cartão só mostra: o rascunho, o que sugeriu de categoria e tags, e de quais
 * conversas saiu. Revisar abre o formulário de FAQ de sempre, um para a página
 * inteira. Com um formulário por cartão havia um seletor de categoria do Radix
 * por sugestão, e seletores irmãos travam o clique da tela inteira (ver
 * usuarios.tsx); e era outro formulário, sem Referência, que deixava a FAQ
 * aprovada mais pobre que a criada à mão.
 */
function CartaoSugestao({
  sugestao,
  aoRevisar,
}: {
  sugestao: Sugestao;
  /** Ausente para quem só vê: o cartão sai sem os botões de decidir. */
  aoRevisar?: () => void;
}) {
  const queryClient = useQueryClient();
  const descartar = useServerFn(descartarSugestao);

  const mutDescartar = useMutation({
    mutationFn: () => descartar({ data: { id: sugestao.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["curadoria-sugestoes"] });
      toast.success("Sugestão descartada");
    },
    onError: (erro: Error) =>
      toast.error(
        erro.message || "Não foi possível descartar. Confira a internet e tente de novo.",
      ),
  });

  const semRascunho = !sugestao.rascunhoResposta.trim();
  const tags = (sugestao.tagsSugeridas ?? []).filter(Boolean);

  return (
    <li className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-base font-semibold">{sugestao.pergunta}</span>
        <Selo tom={sugestao.tipo === "complemento" ? "neutro" : "marca"}>
          {sugestao.tipo === "complemento" ? "Complementa uma FAQ" : "FAQ nova"}
        </Selo>
      </div>

      {sugestao.justificativa && (
        <p className="mt-1 text-sm text-muted-foreground">{sugestao.justificativa}</p>
      )}

      {sugestao.faqRelacionadaId && (
        <Link
          to="/faqs/$id"
          params={{ id: sugestao.faqRelacionadaId }}
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-primary hover:underline"
        >
          Ver a FAQ que já existe
          <ChevronRight className="size-3.5" />
        </Link>
      )}

      {/* A rastreabilidade que motivou a fase: de qual conversa saiu cada
          pergunta. Sem isso a sugestão chega aqui como frase solta. */}
      <div className="mt-3 rounded-lg bg-surface-2 p-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {sugestao.origens.length}{" "}
          {sugestao.origens.length === 1 ? "pessoa perguntou" : "pessoas perguntaram"} isso:
        </p>
        <ul className="mt-1 space-y-1">
          {sugestao.origens.map((origem, i) => (
            <li key={`${origem.mensagemId}:${i}`} className="flex items-center gap-2 text-[15px]">
              <PerguntaComContexto
                pergunta={origem.pergunta}
                entendida={origem.entendida ?? null}
                anterior={origem.anterior ?? null}
              />
              <Link
                to="/conversas/$id"
                params={{ id: origem.sessaoId }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-primary hover:underline"
              >
                <MessagesSquare className="size-4" />
                conversa
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {semRascunho ? (
        <p className="mt-3 flex items-start gap-2.5 rounded-lg bg-warning-soft p-3 text-[15px] text-foreground">
          <AlertTriangle className="mt-0.5 size-[18px] shrink-0 text-warning" />
          <span>
            A resposta veio vazia porque a base não tinha a informação: o modelo só resume o que já
            existe, nunca inventa orientação de saúde. Este texto precisa ser escrito por alguém da
            equipe.
          </span>
        </p>
      ) : (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold text-muted-foreground">Rascunho da resposta</p>
          <p className="whitespace-pre-line text-[15px]">{sugestao.rascunhoResposta}</p>
        </div>
      )}

      {(sugestao.categoriaSugerida || tags.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sugestao.categoriaSugerida && <Selo tom="marca">{sugestao.categoriaSugerida}</Selo>}
          {tags.map((tag) => (
            <Selo key={tag}>{tag}</Selo>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          Sugerido por {sugestao.modelo ?? "modelo"}
          {sugestao.criadaPor ? ` · disparado por ${sugestao.criadaPor}` : ""}
        </span>
        {aoRevisar ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => mutDescartar.mutate()}
              disabled={mutDescartar.isPending}
            >
              {mutDescartar.isPending ? "Descartando…" : "Descartar"}
            </Button>
            <Button onClick={aoRevisar} disabled={mutDescartar.isPending}>
              Revisar e criar FAQ
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Aprovar e descartar ficam com quem tem Sem resposta para editar no grupo.
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * As perguntas que ainda não passaram pela análise.
 *
 * Fechada por padrão: é conferência, não o trabalho principal. Serve para
 * responder "o que exatamente está na fila?" antes de gastar a chamada, e para
 * ver o que a busca tinha encontrado em cada caso.
 */
function FilaBruta() {
  const [aberta, setAberta] = useState(false);
  const lacunas = useQuery({
    queryKey: ["curadoria-lacunas"],
    queryFn: () => listarLacunas(),
    enabled: aberta,
  });

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 p-4 text-left"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
      >
        <span className="text-[15px] font-semibold">Ver o que está na fila</span>
        {aberta ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {aberta && (
        <div className="border-t border-border p-4">
          {lacunas.isError ? (
            <EstadoFalha onTentarDeNovo={() => lacunas.refetch()} tentando={lacunas.isFetching}>
              Não foi possível carregar a fila. Confira a internet e tente de novo.
            </EstadoFalha>
          ) : lacunas.isLoading ? (
            <Carregando compacto texto="Carregando as perguntas sem resposta…" />
          ) : (lacunas.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">A fila está vazia.</p>
          ) : (
            <ul className="space-y-3">
              {(lacunas.data ?? []).map((lacuna) => (
                <li key={`${lacuna.mensagemId}:${lacuna.parte ?? 0}`} className="text-[15px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <PerguntaComContexto
                      pergunta={lacuna.pergunta}
                      entendida={lacuna.entendida ?? null}
                      anterior={lacuna.anterior ?? null}
                      destaque
                    />
                    <Link
                      to="/conversas/$id"
                      params={{ id: lacuna.sessaoId }}
                      className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                    >
                      ver conversa
                    </Link>
                  </div>
                  {lacuna.vizinhas.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Mais próxima: “{lacuna.vizinhas[0].question ?? "pergunta sem texto"}” (
                      {lacuna.vizinhas[0].score.toFixed(3)})
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
