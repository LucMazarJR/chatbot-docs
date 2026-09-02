import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { GateShell, usePodeEscrever } from "@/components/gate";
import { ModeloBotoes } from "@/components/modelo-botoes";
import { PreviaImportacao, type FaqEditavel } from "@/components/previa-importacao";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { decodificarArquivo } from "@/lib/decodificar";
import { getScriptAtivo } from "@/lib/import-scripts.functions";
import {
  commitImportacao,
  getImportacaoEmAndamento,
  getJobImportacao,
  pararImportacao,
  validarImportacao,
  type Job,
  type LinhaValidada,
} from "@/lib/import.functions";
import { ErroDeScript, rodarScript, type AvisoScript } from "@/lib/sandbox";
import { exigirSessao } from "@/lib/guardas";

export const Route = createFileRoute("/importar")({
  beforeLoad: () => exigirSessao(),
  head: () => ({ meta: [{ title: "Importar FAQs | Central de FAQs" }] }),
  component: ImportarPage,
});

function ImportarPage() {
  return (
    <GateShell>
      <PainelImportacao />
    </GateShell>
  );
}

const ROTULO_ESTADO: Record<Job["estado"], string> = {
  rodando: "Gravando…",
  concluido: "Concluido",
  parado: "Interrompido",
  cota_esgotada: "Cota da API esgotada",
  erro: "Falhou",
};

function AreaDeArquivo({
  aoEscolher,
  desabilitado,
  arquivo,
}: {
  aoEscolher: (arquivo: File) => void;
  desabilitado?: boolean;
  arquivo: File | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        const solto = e.dataTransfer.files?.[0];
        if (solto) aoEscolher(solto);
      }}
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-8 ${
        arrastando ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <FileUp className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">
        {arquivo ? arquivo.name : "Arraste o arquivo aqui"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Planilha .xlsx ou documento .docx, ate 10 MB
      </p>

      <input
        ref={input}
        type="file"
        accept=".xlsx,.docx"
        className="hidden"
        onChange={(e) => {
          const escolhido = e.target.files?.[0];
          if (escolhido) aoEscolher(escolhido);
          // Zera o valor para que escolher o MESMO arquivo de novo (depois de
          // corrigi-lo no Excel) dispare o onChange outra vez.
          e.target.value = "";
        }}
      />

      <Button
        type="button"
        variant="outline"
        className="mt-4"
        disabled={desabilitado}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-4" /> Escolher arquivo
      </Button>
    </div>
  );
}

function Andamento({ job, aoParar }: { job: Job; aoParar: () => void }) {
  const pct = job.total > 0 ? Math.round((job.processados / job.total) * 100) : 0;
  const semVetor = job.contadores.semEmbedding ?? 0;

  return (
    <section className="rounded-lg border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{ROTULO_ESTADO[job.estado]}</h2>
        <p className="text-xs text-muted-foreground">
          {job.processados} de {job.total} · iniciado por {job.atorNome}
        </p>
      </div>

      <Progress value={pct} className="mt-3" />

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <li>{job.contadores.inseridas ?? 0} inseridas</li>
        <li>{job.contadores.puladas ?? 0} puladas</li>
        <li>{job.contadores.invalidas ?? 0} com problema</li>
      </ul>

      {job.mensagem && <p className="mt-3 text-sm text-muted-foreground">{job.mensagem}</p>}

      {semVetor > 0 && (
        // A FAQ entrou mas o chatbot nao a encontra. Sem este aviso, o defeito
        // so apareceria semanas depois, quando alguem notasse que uma pergunta
        // nunca e respondida.
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {semVetor} FAQ(s) entraram <strong>sem vetor</strong> e o chatbot nao vai encontra-las.{" "}
          <Link to="/configuracoes" className="underline underline-offset-2">
            Gere os vetores em Configuracoes
          </Link>
          .
        </p>
      )}

      {job.erros.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {job.erros.length + job.errosOmitidos} linha(s) com problema
          </summary>
          <ul className="mt-2 space-y-1">
            {job.erros.map((erro, i) => (
              <li key={i} className="break-words text-xs text-destructive">
                linha {erro.linha}: {erro.mensagem}
              </li>
            ))}
          </ul>
        </details>
      )}

      {job.estado === "rodando" && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={aoParar}>
          <X className="size-4" /> Parar
        </Button>
      )}
    </section>
  );
}

function PainelImportacao() {
  const podeEscrever = usePodeEscrever();
  const queryClient = useQueryClient();

  const validar = useServerFn(validarImportacao);
  const commit = useServerFn(commitImportacao);
  const parar = useServerFn(pararImportacao);

  const script = useQuery({ queryKey: ["script-ativo"], queryFn: () => getScriptAtivo() });

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [avisos, setAvisos] = useState<AvisoScript[]>([]);
  const [itens, setItens] = useState<LinhaValidada[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [lendo, setLendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  // Uma importação que já estava rodando quando a tela abriu — inclusive
  // iniciada em outro aparelho. Sem isto, a pessoa tentaria começar outra e
  // levaria um 409 sem entender por quê.
  const emAndamento = useQuery({
    queryKey: ["importacao-andamento"],
    queryFn: () => getImportacaoEmAndamento(),
  });

  useEffect(() => {
    if (!jobId && emAndamento.data?.id) setJobId(emAndamento.data.id);
  }, [emAndamento.data, jobId]);

  const job = useQuery({
    queryKey: ["importacao-job", jobId],
    queryFn: () => getJobImportacao({ data: { id: jobId as string } }),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.estado === "rodando" ? 2000 : false),
  });

  const rodando = job.data?.estado === "rodando";

  // Terminou: a listagem de FAQs e as categorias ficaram velhas.
  const estadoJob = job.data?.estado;
  useEffect(() => {
    if (estadoJob && estadoJob !== "rodando") {
      void queryClient.invalidateQueries({ queryKey: ["faqs"] });
      void queryClient.invalidateQueries({ queryKey: ["faq-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  }, [estadoJob, queryClient]);

  const revalidar = async (faqs: unknown[]) => {
    const resultado = await validar({ data: { faqs } });
    setItens(resultado.itens);
    // Só o que está pronto entra marcado. Duplicada e inválida ficam de fora e
    // nem podem ser marcadas na prévia.
    setSelecionadas(new Set(resultado.itens.filter((i) => i.estado === "ok").map((i) => i.linha)));
    return resultado;
  };

  const processar = async (escolhido: File) => {
    if (!script.data) {
      toast.error("Nenhum script de geracao ativo. Fale com um administrador.");
      return;
    }

    setArquivo(escolhido);
    setLendo(true);
    setItens([]);
    setAvisos([]);
    setSelecionadas(new Set());

    try {
      const entrada = await decodificarArquivo(escolhido);
      const saida = await rodarScript(script.data.code, entrada);

      setAvisos(saida.avisos ?? []);

      if (!saida.faqs || saida.faqs.length === 0) {
        toast.warning("O script nao encontrou nenhuma FAQ neste arquivo.", {
          description: "Confira se o arquivo segue o modelo.",
        });
        return;
      }

      const resultado = await revalidar(saida.faqs);
      toast.success(
        `${resultado.resumo.ok} nova(s), ${resultado.resumo.duplicadas} ja existente(s), ` +
          `${resultado.resumo.invalidas} com problema.`,
      );
    } catch (erro) {
      // ErroDeScript traz `detalhe` com a pilha de dentro do worker; ErroDeArquivo
      // ja vem com uma mensagem escrita para quem enviou o arquivo.
      const detalhe = erro instanceof ErroDeScript ? erro.detalhe : undefined;
      toast.error(erro instanceof Error ? erro.message : String(erro), { description: detalhe });
    } finally {
      setLendo(false);
    }
  };

  const mutEditar = useMutation({
    mutationFn: async ({ linha, faq }: { linha: number; faq: FaqEditavel }) => {
      // Revalida o conjunto INTEIRO, e não só a linha editada: corrigir uma
      // pergunta pode transformá-la na duplicata de outra linha do mesmo
      // arquivo, e essa relação só aparece olhando todas juntas.
      const comEdicao = itens.map((item) =>
        item.linha === linha ? { ...faq, linha } : { ...item.faq, linha: item.linha },
      );
      return revalidar(comEdicao);
    },
    onError: (erro: Error) => toast.error(erro.message || "Nao foi possivel revalidar"),
  });

  const mutCommit = useMutation({
    mutationFn: async () => {
      if (!script.data) throw new Error("Sem script ativo.");
      const escolhidas = itens
        .filter((i) => selecionadas.has(i.linha))
        .map((i) => ({ ...i.faq, linha: i.linha }));

      return commit({
        data: {
          faqs: escolhidas,
          nomeArquivo: arquivo?.name ?? "importacao",
          scriptId: script.data.id,
          scriptVersion: script.data.version,
        },
      });
    },
    onSuccess: (resultado) => {
      setConfirmando(false);
      setJobId(resultado.jobId);
      toast.success(`Gravando ${resultado.total} FAQ(s).`);
    },
    onError: (erro: Error) => {
      setConfirmando(false);
      toast.error(erro.message || "Nao foi possivel iniciar a importacao");
    },
  });

  const mutParar = useMutation({
    mutationFn: () => parar({ data: { id: jobId as string } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["importacao-job", jobId] }),
  });

  const totalSelecionado = useMemo(
    () => itens.filter((i) => selecionadas.has(i.linha)).length,
    [itens, selecionadas],
  );

  if (!podeEscrever) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Seu perfil e apenas de leitura. Peca a um editor ou administrador para importar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar FAQs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie uma planilha ou um documento no formato do modelo. Nada e gravado antes de voce
          conferir a previa.
        </p>
      </div>

      <section className="rounded-lg border border-border p-4 sm:p-5">
        <h2 className="text-base font-semibold">Nao tem o modelo?</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Baixe o arquivo vazio, preencha e envie de volta. Ele e gerado a partir do script de
          geracao ativo, entao esta sempre no formato que a leitura espera.
        </p>
        <ModeloBotoes codigo={script.data?.code} desabilitado={script.isLoading} />
      </section>

      <AreaDeArquivo
        arquivo={arquivo}
        aoEscolher={(escolhido) => void processar(escolhido)}
        desabilitado={lendo || rodando}
      />

      {lendo && <p className="text-sm text-muted-foreground">Lendo o arquivo…</p>}

      {avisos.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold">Avisos da leitura</h2>
          <ul className="mt-2 space-y-1">
            {avisos.map((aviso, i) => (
              <li key={i} className="break-words text-sm text-muted-foreground">
                linha {aviso.linha}: {aviso.mensagem}
              </li>
            ))}
          </ul>
        </section>
      )}

      {itens.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Previa · {totalSelecionado} selecionada(s)</h2>
            <Button
              type="button"
              disabled={totalSelecionado === 0 || rodando || mutCommit.isPending}
              onClick={() => setConfirmando(true)}
            >
              Importar {totalSelecionado > 0 ? `${totalSelecionado} FAQ(s)` : ""}
            </Button>
          </div>

          <PreviaImportacao
            itens={itens}
            selecionadas={selecionadas}
            aoTrocarSelecao={setSelecionadas}
            aoEditar={(linha, faq) => mutEditar.mutate({ linha, faq })}
            desabilitado={rodando || mutEditar.isPending}
          />
        </section>
      )}

      {job.data && <Andamento job={job.data} aoParar={() => mutParar.mutate()} />}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar {totalSelecionado} FAQ(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Cada FAQ gera um vetor de busca, entao isso leva alguns segundos por linha. Voce pode
              fechar a aba: o trabalho continua e o andamento reaparece quando voltar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutCommit.mutate();
              }}
              disabled={mutCommit.isPending}
            >
              {mutCommit.isPending ? "Iniciando…" : "Importar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
