import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { listarCategorias } from "@/lib/categorias.functions";
import { GateShell } from "@/components/gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exigirAdmin } from "@/lib/guardas";

export const Route = createFileRoute("/curadoria")({
  beforeLoad: () => exigirAdmin(),
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

  const fila = useQuery({ queryKey: ["curadoria-fila"], queryFn: () => getFilaCuradoria() });
  const sugestoes = useQuery({
    queryKey: ["curadoria-sugestoes", "pendente"],
    queryFn: () => listarSugestoes({ data: { estado: "pendente" } }),
  });
  const job = useQuery({
    queryKey: ["curadoria-job"],
    queryFn: () => getJobCuradoria(),
    // Só enquanto há job rodando: fora disso, uma consulta a cada 2s por aba
    // aberta é tráfego sem nenhuma informação nova.
    refetchInterval: (query) => (query.state.data?.estado === "rodando" ? 2000 : false),
  });

  const rodando = job.data?.estado === "rodando";

  // Quando o job termina, o que mudou está na fila e nas sugestões — nenhuma
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
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível analisar agora"),
  });

  const pendentes = fila.data?.pendentes ?? 0;
  const tamanho = fila.data?.tamanhoDaRodada ?? 10;
  const lista = sugestoes.data?.itens ?? [];

  return (
    <GateShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Perguntas sem resposta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {fila.isLoading
                ? "Carregando…"
                : pendentes === 0
                  ? "Nenhuma pergunta aguardando análise."
                  : `${pendentes} ${pendentes === 1 ? "pergunta aguarda" : "perguntas aguardam"} análise. Cada rodada olha até ${tamanho} de uma vez.`}
            </p>
          </div>
          <Button
            onClick={() => disparar.mutate()}
            disabled={rodando || disparar.isPending || pendentes === 0}
          >
            <Sparkles className="size-4" />
            {rodando ? "Analisando…" : "Analisar agora"}
          </Button>
        </div>

        {job.data && <Andamento job={job.data} />}

        {!fila.isLoading && pendentes > 0 && !fila.data?.prontoParaRodar && (
          <p className="flex items-start gap-2 rounded-lg border border-border panel-surface p-4 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Dá para analisar já, mas juntar perto de {tamanho} rende mais: é vendo várias
              perguntas juntas que dá para perceber que "onde fica a UBS" e "qual o endereço do
              posto" são a mesma FAQ faltando.
            </span>
          </p>
        )}

        <section className="space-y-3">
          <h3 className="text-base font-semibold">
            Sugestões aguardando decisão {lista.length > 0 && `(${lista.length})`}
          </h3>

          {sugestoes.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground sm:p-8">
              Nenhuma sugestão pendente. Quando houver perguntas na fila, rode a análise.
            </p>
          ) : (
            <ul className="space-y-4">
              {lista.map((sugestao) => (
                <CartaoSugestao key={sugestao.id} sugestao={sugestao} />
              ))}
            </ul>
          )}
        </section>

        <FilaBruta />

        <HistoricoDeRodadas />
      </div>
    </GateShell>
  );
}

/**
 * Toda vez que a análise foi disparada, e com que conteúdo.
 *
 * LÓGICA DO LUCIANO: sem isto, a única marca de que o modelo agiu seria a
 * sugestão que sobreviveu — e sugestão descartada some sem deixar rastro. Quem
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
    <section className="rounded-lg border border-border panel-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <History className="size-4" />
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
          {rodadas.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">A análise ainda não foi disparada.</p>
          ) : (
            <ul className="space-y-3">
              {lista.map((rodada) => (
                <li key={rodada.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {new Date(rodada.iniciadaEm).toLocaleString("pt-BR")} · {rodada.atorNome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rodada.perguntas.length}{" "}
                        {rodada.perguntas.length === 1 ? "pergunta" : "perguntas"} ·{" "}
                        {rodada.sugestoesCriadas.length}{" "}
                        {rodada.sugestoesCriadas.length === 1 ? "sugestão" : "sugestões"}
                        {rodada.foraDeEscopo.length > 0 &&
                          ` · ${rodada.foraDeEscopo.length} fora do escopo`}
                        {rodada.modelo && ` · ${rodada.modelo}`}
                      </p>
                      {rodada.erro && (
                        <p className="mt-1 text-xs text-destructive">{rodada.erro}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
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

  if (rodada.isLoading) return <p className="mt-3 text-xs text-muted-foreground">Carregando…</p>;
  if (!rodada.data) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <ul className="space-y-2">
        {rodada.data.lacunas.map((lacuna) => (
          <li key={lacuna.mensagemId} className="text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0">“{lacuna.pergunta}”</span>
              <Link
                to="/conversas/$id"
                params={{ id: lacuna.sessaoId }}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              >
                conversa
              </Link>
            </div>
            {lacuna.vizinhas.length > 0 && (
              <ul className="mt-0.5 space-y-0.5">
                {lacuna.vizinhas.map((v, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="tabular-nums">{v.score.toFixed(3)}</span> ·{" "}
                    {v.question ?? "—"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Resposta do modelo, como veio
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
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
 * respondeu é conteúdo faltando — na primeira fila real havia "qual o melhor
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

  return `Análise concluída — ${partes.join(", ")}`;
}

function Andamento({ job }: { job: NonNullable<Awaited<ReturnType<typeof getJobCuradoria>>> }) {
  const rodando = job.estado === "rodando";
  const pct = job.total > 0 ? Math.round((job.processados / job.total) * 100) : 0;

  return (
    <div className="rounded-lg border border-border panel-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {rodando
            ? "Analisando as perguntas da fila…"
            : job.estado === "concluido"
              ? resumoDaAnalise(job.contadores ?? {})
              : "A última análise não terminou"}
        </p>
        <span className="text-xs text-muted-foreground">por {job.atorNome}</span>
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

function CartaoSugestao({ sugestao }: { sugestao: Sugestao }) {
  const queryClient = useQueryClient();
  const aprovar = useServerFn(aprovarSugestao);
  const descartar = useServerFn(descartarSugestao);

  const [pergunta, setPergunta] = useState(sugestao.pergunta);
  const [resposta, setResposta] = useState(sugestao.rascunhoResposta);
  const [categoria, setCategoria] = useState(sugestao.categoriaSugerida ?? "");
  const [tags, setTags] = useState((sugestao.tagsSugeridas ?? []).join(", "));

  const categoriasQuery = useQuery({
    queryKey: ["categorias", false],
    queryFn: () => listarCategorias({ data: { incluirInativas: false } }),
  });
  const oficiais = categoriasQuery.data?.categorias ?? [];

  const invalidar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["curadoria-sugestoes"] });
    await queryClient.invalidateQueries({ queryKey: ["faqs"] });
    await queryClient.invalidateQueries({ queryKey: ["faq-categories"] });
  };

  const mutAprovar = useMutation({
    mutationFn: () =>
      aprovar({
        data: {
          id: sugestao.id,
          question: pergunta.trim(),
          answer: resposta.trim(),
          category: categoria.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: async (r) => {
      await invalidar();
      toast.success(
        r.semEmbedding
          ? "FAQ criada, mas sem preparo para a busca — reindexe em Configurações."
          : "FAQ criada",
      );
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível aprovar"),
  });

  const mutDescartar = useMutation({
    mutationFn: () => descartar({ data: { id: sugestao.id } }),
    onSuccess: async () => {
      await invalidar();
      toast.success("Sugestão descartada");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível descartar"),
  });

  const semRascunho = !sugestao.rascunhoResposta.trim();
  const podeAprovar = pergunta.trim().length >= 5 && resposta.trim().length >= 5;

  return (
    <li className="rounded-lg border border-border panel-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-base font-semibold">{sugestao.pergunta}</span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
            sugestao.tipo === "complemento"
              ? "border-border bg-muted text-muted-foreground"
              : "border-primary/30 bg-primary/10 text-primary"
          }`}
        >
          {sugestao.tipo === "complemento" ? "Complementa uma FAQ" : "FAQ nova"}
        </span>
      </div>

      {sugestao.justificativa && (
        <p className="mt-1 text-sm text-muted-foreground">{sugestao.justificativa}</p>
      )}

      {sugestao.faqRelacionadaId && (
        <Link
          to="/faqs/$id"
          params={{ id: sugestao.faqRelacionadaId }}
          className="mt-1 inline-flex items-center gap-1 text-sm hover:underline"
        >
          Ver a FAQ que já existe
          <ChevronRight className="size-3.5" />
        </Link>
      )}

      {/* A rastreabilidade que motivou a fase: de qual conversa saiu cada
          pergunta. Sem isso a sugestão chega aqui como frase solta. */}
      <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          {sugestao.origens.length}{" "}
          {sugestao.origens.length === 1 ? "pessoa perguntou" : "pessoas perguntaram"} isso:
        </p>
        <ul className="mt-1 space-y-1">
          {sugestao.origens.map((origem) => (
            <li key={origem.mensagemId} className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1">“{origem.pergunta}”</span>
              <Link
                to="/conversas/$id"
                params={{ id: origem.sessaoId }}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MessagesSquare className="size-3.5" />
                conversa
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {semRascunho && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            A resposta veio vazia porque a base não tinha a informação — o modelo só resume o que
            já existe, nunca inventa orientação de saúde. Este texto precisa ser escrito por
            alguém da equipe.
          </span>
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div className="space-y-1">
          <Label htmlFor={`pergunta-${sugestao.id}`}>Pergunta</Label>
          <Input
            id={`pergunta-${sugestao.id}`}
            value={pergunta}
            maxLength={300}
            onChange={(e) => setPergunta(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`resposta-${sugestao.id}`}>Resposta</Label>
          <Textarea
            id={`resposta-${sugestao.id}`}
            value={resposta}
            rows={5}
            maxLength={4000}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="Escreva a orientação completa…"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`categoria-${sugestao.id}`}>Categoria</Label>
            {oficiais.length === 0 ? (
              <Input
                id={`categoria-${sugestao.id}`}
                value={categoria}
                maxLength={60}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ex.: Exames"
              />
            ) : (
              <Select value={categoria || undefined} onValueChange={setCategoria}>
                <SelectTrigger id={`categoria-${sugestao.id}`} className="w-full">
                  <SelectValue placeholder="Escolha o assunto" />
                </SelectTrigger>
                <SelectContent>
                  {categoria && !oficiais.some((c) => c.nome === categoria) && (
                    <SelectItem value={categoria}>{categoria} — fora da lista</SelectItem>
                  )}
                  {oficiais.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`tags-${sugestao.id}`}>Tags</Label>
            <Input
              id={`tags-${sugestao.id}`}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="separadas por vírgula"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Sugerido por {sugestao.modelo ?? "modelo"} · disparado por {sugestao.criadaPor ?? "—"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => mutDescartar.mutate()}
            disabled={mutDescartar.isPending || mutAprovar.isPending}
          >
            Descartar
          </Button>
          <Button
            onClick={() => mutAprovar.mutate()}
            disabled={!podeAprovar || mutAprovar.isPending || mutDescartar.isPending}
          >
            {mutAprovar.isPending ? "Criando…" : "Aprovar e criar FAQ"}
          </Button>
        </div>
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
    <section className="rounded-lg border border-border panel-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
      >
        <span className="text-sm font-medium">Ver o que está na fila</span>
        {aberta ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {aberta && (
        <div className="border-t border-border p-4">
          {lacunas.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (lacunas.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">A fila está vazia.</p>
          ) : (
            <ul className="space-y-3">
              {(lacunas.data ?? []).map((lacuna) => (
                <li key={lacuna.mensagemId} className="text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium">“{lacuna.pergunta}”</span>
                    <Link
                      to="/conversas/$id"
                      params={{ id: lacuna.sessaoId }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ver conversa
                    </Link>
                  </div>
                  {lacuna.vizinhas.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Mais próxima: “{lacuna.vizinhas[0].question ?? "—"}” (
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
