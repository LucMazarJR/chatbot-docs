import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, HelpCircle, Play } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MODOS: { valor: ModoBackfill; rotulo: string; descricao: string }[] = [
  {
    valor: "faltantes",
    rotulo: "Sem vetor",
    descricao: "FAQs que estao na base mas o chatbot nunca encontra",
  },
  {
    valor: "desatualizados",
    rotulo: "Vetor desatualizado",
    descricao: "O texto foi editado depois que o vetor foi gerado",
  },
  {
    valor: "nao_registrados",
    rotulo: "Modelo nao registrado",
    descricao: "Nao ha registro de qual modelo gerou o vetor",
  },
  {
    valor: "divergentes",
    rotulo: "Modelo divergente",
    descricao: "Registrado num modelo diferente do configurado",
  },
  { valor: "tudo", rotulo: "Tudo", descricao: "Toda a base ativa. Gasta muita cota" },
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
    <div className="rounded-lg border border-border bg-card p-4">
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
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{explicacao}</p>
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
      ? "text-primary"
      : dados.veredito === "modelo_diferente"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
      <p className={`flex items-start gap-2 text-sm font-medium ${cor}`}>
        <Icone className="mt-0.5 size-4 shrink-0" />
        <span>{dados.explicacao}</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {dados.amostradas} FAQ(s) amostradas · semelhanca media{" "}
        {(dados.similaridadeMedia * 100).toFixed(1)}% em relacao ao que {dados.modeloConfigurado}{" "}
        gera agora
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
    onError: (erro: Error) => toast.error(erro.message || "Nao foi possivel diagnosticar"),
  });

  const mutBackfill = useMutation({
    mutationFn: () => iniciar({ data: { modo, limite } }),
    onSuccess: async (resultado) => {
      if (resultado.total === 0) {
        toast.info("Nada a fazer neste modo — nenhuma FAQ se encaixa.");
      } else {
        toast.success(`Geracao iniciada para ${resultado.total} FAQ(s).`);
      }
      await queryClient.invalidateQueries({ queryKey: ["embeddings-job"] });
    },
    onError: (erro: Error) => toast.error(erro.message || "Nao foi possivel iniciar"),
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
        <h2 className="text-lg font-semibold">Saude dos vetores</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Uma FAQ sem vetor esta na base e aparece na listagem, mas o chatbot nunca a encontra. Nao
          ha erro em lugar nenhum — so a pergunta que nunca e respondida.
        </p>
      </div>

      {saude.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !dados ? (
        <p className="text-sm text-destructive">Nao foi possivel ler a saude da base.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metrica
              rotulo="FAQs ativas"
              valor={dados.totalAtivas}
              explicacao={`Modelo configurado: ${dados.modeloConfigurado}, ${dados.dimensaoEsperada} dimensoes.`}
            />
            <Metrica
              rotulo="Sem vetor"
              valor={dados.semVetor}
              alerta
              explicacao="Invisiveis para a busca do chatbot."
            />
            <Metrica
              rotulo="Dimensao errada"
              valor={dados.dimensaoErrada}
              alerta
              explicacao="O indice do Atlas nao casa com o tamanho do vetor."
            />
            <Metrica
              rotulo="Vetor desatualizado"
              valor={dados.vetorDesatualizado}
              alerta
              explicacao="O texto mudou depois que o vetor foi gerado: o chatbot acha pelo texto antigo e mostra o novo."
            />
            <Metrica
              rotulo="Modelo divergente"
              valor={dados.modeloDivergente}
              alerta
              explicacao="Registrado num modelo diferente do que esta configurado."
            />
            <Metrica
              rotulo="Modelo nao registrado"
              valor={dados.modeloNaoRegistrado}
              explicacao="Nao da para saber qual modelo gerou. Nao e o mesmo que estar errado — use o diagnostico abaixo."
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">Em que modelo a base esta, afinal?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Os dados nao respondem: o registro do modelo so passou a ser gravado recentemente, e a
              dimensao nao distingue — o gemini-embedding-001 tambem produz 3072 quando pedido. O
              jeito de descobrir e gerar vetores novos para uma amostra e comparar com os guardados.
              Custa 10 chamadas a API.
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
              {mutDiagnostico.isPending ? "Comparando…" : "Diagnosticar por amostragem"}
            </Button>
            {diagnostico && <ResultadoDiagnostico dados={diagnostico} />}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">Gerar vetores</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A cota gratuita do Gemini e de 1000 requisicoes por dia <strong>por projeto</strong> —
              chaves extras do mesmo projeto dividem a mesma cota. Reindexar a base inteira leva
              dias. O trabalho retoma de onde parou a cada execucao.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">O que gerar</label>
                <Select value={modo} onValueChange={(v) => setModo(v as ModoBackfill)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODOS.map((m) => (
                      <SelectItem key={m.valor} value={m.valor}>
                        {m.rotulo} — {m.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Maximo nesta execucao
                </label>
                <Select value={String(limite)} onValueChange={(v) => setLimite(Number(v))}>
                  <SelectTrigger className="w-full">
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
              {emAndamento ? "Ja ha um trabalho rodando" : "Comecar"}
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
    rodando: "Gerando…",
    concluido: "Concluido",
    parado: "Interrompido",
    cota_esgotada: "Cota da API esgotada",
    erro: "Falhou",
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
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
