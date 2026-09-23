import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import {
  diagnosticarEmbeddings,
  getJobEmbeddings,
  getSaudeEmbeddings,
  iniciarBackfill,
  type Diagnostico,
  type ModoBackfill,
} from "@/lib/embeddings.functions";
import type { Job } from "@/lib/import.functions";
import { listarRevisaoCategorias } from "@/lib/categorias.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Carregando } from "@/components/carregando";
import { EstadoFalha } from "@/components/estado";

const MODOS: { valor: ModoBackfill; rotulo: string; descricao: string }[] = [
  {
    valor: "faltantes",
    rotulo: "Fora da busca",
    descricao: "Perguntas salvas que o chatbot nunca encontra",
  },
  {
    valor: "desatualizados",
    rotulo: "Desatualizadas",
    descricao: "O texto mudou depois da última preparação",
  },
  {
    valor: "nao_registrados",
    rotulo: "Sem registro",
    descricao: "Não dá para saber como foram preparadas",
  },
  {
    valor: "divergentes",
    rotulo: "Fora do padrão atual",
    descricao: "Preparadas de um jeito diferente do que se usa hoje",
  },
  { valor: "tudo", rotulo: "Tudo", descricao: "A base inteira. Demora e consome o limite diário" },
];

const LIMITES = [50, 200, 500, 1000];

function Metrica({
  rotulo,
  valor,
  alerta,
  explicacao,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
  explicacao: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p
        className={
          alerta && valor > 0
            ? "text-2xl font-semibold text-destructive"
            : "text-2xl font-semibold text-foreground"
        }
      >
        {valor.toLocaleString("pt-BR")}
      </p>
      <p className="mt-0.5 text-sm font-medium">{rotulo}</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{explicacao}</p>
    </div>
  );
}

function ResultadoDiagnostico({ dados }: { dados: Diagnostico }) {
  const Icone =
    dados.veredito === "mesmo_modelo"
      ? CheckCircle2
      : dados.veredito === "modelo_diferente"
        ? AlertTriangle
        : HelpCircle;

  const cor =
    dados.veredito === "mesmo_modelo"
      ? "text-success"
      : dados.veredito === "modelo_diferente"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="mt-4 rounded-lg bg-surface-2 p-4">
      <p className={`flex items-start gap-2 text-sm font-medium ${cor}`}>
        <Icone className="mt-0.5 size-4 shrink-0" />
        <span>{dados.explicacao}</span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {dados.amostradas} {dados.amostradas === 1 ? "pergunta conferida" : "perguntas conferidas"}{" "}
        · {(dados.similaridadeMedia * 100).toFixed(1)}% de semelhança com o preparo atual
      </p>
    </div>
  );
}

/**
 * Saúde vetorial da base e as ações para corrigi-la.
 *
 * LÓGICA DO LUCIANO: "modelo não registrado" aparece como número próprio, e não
 * escondido dentro de "divergente", porque as duas coisas são diferentes e a
 * segunda não pode ser deduzida. O campo `embedding_model` só passou a ser
 * escrito recentemente — a maior parte da base não o tem. E a dimensão não
 * responde: o gemini-embedding-001 também produz 3072 quando pedido. Quem
 * responde de verdade é o diagnóstico por amostragem, que custa ~10 chamadas.
 */
/**
 * As perguntas cujo assunto não fecha com a lista oficial.
 *
 * LÓGICA DO LUCIANO: está nesta tela, e não só na de categorias, porque o
 * defeito é da mesma natureza dos outros daqui e é igualmente invisível. A
 * categoria entra no texto que vira vetor ("Assunto: ..."), então uma pergunta
 * com o assunto errado é encontrada pelo assunto errado — ela aparece na
 * listagem, tem vetor, está em dia, e mesmo assim responde a pergunta errada.
 * Nenhuma das seis métricas acima enxerga isso.
 *
 * Os números levam para a tela de categorias em vez de repetir os controles
 * aqui: a correção é decisão de conteúdo, e o lugar dela é onde a lista vive.
 */
function AssuntosParaRevisar() {
  const revisao = useQuery({
    queryKey: ["categorias-revisao"],
    queryFn: () => listarRevisaoCategorias(),
  });

  const dados = revisao.data;
  if (!dados || dados.grupos.length === 0) return null;

  const { variante, fora_da_lista, inativa, sem_categoria } = dados.resumo.porMotivo;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Perguntas com o assunto fora da lista</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {dados.listaVazia
          ? "A lista oficial de assuntos ainda não foi definida, então toda pergunta aparece aqui."
          : `${dados.resumo.faqs} ${dados.resumo.faqs === 1 ? "pergunta usa" : "perguntas usam"} um assunto que não está na lista, em ${dados.resumo.grupos} ${dados.resumo.grupos === 1 ? "nome" : "nomes"} diferentes. O assunto faz parte do que o chatbot busca: com ele errado, a pergunta é encontrada pelo tema errado.`}
      </p>

      {!dados.listaVazia && (
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {fora_da_lista > 0 && <li>{fora_da_lista} em assuntos que não existem na lista</li>}
          {variante > 0 && <li>{variante} só com a grafia diferente</li>}
          {inativa > 0 && <li>{inativa} em assuntos aposentados</li>}
          {sem_categoria > 0 && <li>{sem_categoria} sem assunto nenhum</li>}
        </ul>
      )}

      <Link
        to="/categorias"
        className="mt-3 inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-primary hover:underline"
      >
        Revisar em Categorias
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

export function SaudeEmbeddings() {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<ModoBackfill>("faltantes");
  const [limite, setLimite] = useState(200);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);

  const diagnosticar = useServerFn(diagnosticarEmbeddings);
  const iniciar = useServerFn(iniciarBackfill);

  const saude = useQuery({
    queryKey: ["embeddings-health"],
    queryFn: () => getSaudeEmbeddings(),
  });

  const job = useQuery({
    queryKey: ["embeddings-job"],
    queryFn: () => getJobEmbeddings(),
    // Enquanto há trabalho rodando, pergunta a cada 2s; parado, para de
    // perguntar. Um intervalo fixo manteria a aba conversando com a API para
    // sempre, à toa.
    refetchInterval: (query) => (query.state.data?.estado === "rodando" ? 2000 : false),
  });

  const mutDiagnostico = useMutation({
    mutationFn: () => diagnosticar({ data: { quantidade: 10 } }),
    onSuccess: (dados) => setDiagnostico(dados),
    onError: (erro: Error) =>
      toast.error(erro.message || "Não foi possível conferir agora. Tente de novo em instantes."),
  });

  const mutBackfill = useMutation({
    mutationFn: () => iniciar({ data: { modo, limite } }),
    onSuccess: async (resultado) => {
      if (resultado.total === 0) {
        toast.info("Nada a fazer: nenhuma pergunta se encaixa.");
      } else {
        toast.success(`Preparando ${resultado.total} pergunta(s).`);
      }
      await queryClient.invalidateQueries({ queryKey: ["embeddings-job"] });
    },
    onError: (erro: Error) =>
      toast.error(erro.message || "Não foi possível começar. Confira a internet e tente de novo."),
  });

  const dados = saude.data;
  const estadoJob = job.data?.estado;
  const emAndamento = estadoJob === "rodando";

  // Quando o trabalho termina, as contagens da tela ficaram velhas. Num
  // useEffect, e nao no corpo do componente: invalidar durante o render dispara
  // um novo render no meio de um render, e o React entra em laco.
  useEffect(() => {
    if (estadoJob && estadoJob !== "rodando") {
      void queryClient.invalidateQueries({ queryKey: ["embeddings-health"] });
    }
  }, [estadoJob, queryClient]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Perguntas encontradas pelo chatbot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Toda pergunta salva precisa ser preparada para a busca. Se a preparação falhar, ela
          continua aparecendo na listagem daqui, mas o chatbot nunca a encontra, e nada indica isso:
          é só uma pergunta que nunca é respondida.
        </p>
      </div>

      {saude.isLoading ? (
        <Carregando texto="Conferindo a base de vetores…" />
      ) : !dados ? (
        <EstadoFalha onTentarDeNovo={() => saude.refetch()} tentando={saude.isFetching}>
          Não foi possível ler o estado da base. Confira a internet e tente de novo.
        </EstadoFalha>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metrica
              rotulo="FAQs ativas"
              valor={dados.totalAtivas}
              explicacao={`Preparadas com o padrão atual do sistema: ${dados.modeloConfigurado}.`}
            />
            <Metrica
              rotulo="Fora da busca"
              valor={dados.semVetor}
              alerta
              explicacao="O chatbot não consegue encontrá-las."
            />
            <Metrica
              rotulo="Preparadas de forma incompatível"
              valor={dados.dimensaoErrada}
              alerta
              explicacao="Foram preparadas num formato que a busca atual não lê."
            />
            <Metrica
              rotulo="Desatualizadas"
              valor={dados.vetorDesatualizado}
              alerta
              explicacao="O texto mudou depois da preparação: o chatbot acha pelo texto antigo e mostra o novo."
            />
            <Metrica
              rotulo="Fora do padrão atual"
              valor={dados.modeloDivergente}
              alerta
              explicacao="Registrado num modelo diferente do que está configurado."
            />
            <Metrica
              rotulo="Sem registro"
              valor={dados.modeloNaoRegistrado}
              explicacao="Preparadas antes de o sistema registrar isso. Não quer dizer que estão erradas."
            />
          </div>

          <AssuntosParaRevisar />

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">
              As perguntas antigas foram preparadas do mesmo jeito?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A base não guarda esse registro para as perguntas mais antigas, e não dá para deduzir
              olhando os dados. O jeito de descobrir é preparar de novo algumas perguntas e comparar
              com o que está salvo. São cerca de 10 perguntas, e não altera nada.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={mutDiagnostico.isPending}
              onClick={() => mutDiagnostico.mutate()}
            >
              <Activity className="size-4" />
              {mutDiagnostico.isPending ? "Conferindo…" : "Conferir por amostragem"}
            </Button>
            {diagnostico && <ResultadoDiagnostico dados={diagnostico} />}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Preparar perguntas para a busca</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A preparação usa um serviço externo com limite diário. Preparar a base inteira leva
              alguns dias, e não tem problema: o trabalho retoma de onde parou a cada vez que você
              começa de novo.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="preparar-modo" className="text-sm font-semibold">
                  O que preparar
                </label>
                <Select value={modo} onValueChange={(v) => setModo(v as ModoBackfill)}>
                  <SelectTrigger id="preparar-modo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODOS.map((m) => (
                      <SelectItem key={m.valor} value={m.valor}>
                        {m.rotulo}, {m.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label htmlFor="preparar-limite" className="text-sm font-semibold">
                  Máximo desta vez
                </label>
                <Select value={String(limite)} onValueChange={(v) => setLimite(Number(v))}>
                  <SelectTrigger id="preparar-limite" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIMITES.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} FAQs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="button"
              className="mt-3"
              disabled={emAndamento || mutBackfill.isPending}
              onClick={() => mutBackfill.mutate()}
            >
              <Play className="size-4" />
              {emAndamento ? "Já há um trabalho em andamento" : "Começar"}
            </Button>

            {job.data && <AndamentoBackfill job={job.data} />}
          </div>
        </>
      )}
    </section>
  );
}

function AndamentoBackfill({ job }: { job: Job }) {
  const pct = job.total > 0 ? Math.round((job.processados / job.total) * 100) : 0;

  const rotulo: Record<string, string> = {
    rodando: "Preparando…",
    concluido: "Concluído",
    parado: "Interrompido",
    cota_esgotada: "Limite diário atingido",
    erro: "Não foi possível concluir",
  };

  return (
    <div className="mt-4 rounded-lg bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{rotulo[job.estado] ?? job.estado}</p>
        <p className="text-xs text-muted-foreground">
          {job.processados} de {job.total} · iniciado por {job.atorNome}
        </p>
      </div>
      <Progress value={pct} className="mt-2" />
      {job.mensagem && <p className="mt-2 text-xs text-muted-foreground">{job.mensagem}</p>}
      {(job.contadores.falhas ?? 0) > 0 && (
        <p className="mt-2 text-xs text-destructive">
          {job.contadores.falhas} falha(s). {job.erros[0]?.mensagem}
        </p>
      )}
    </div>
  );
}
