import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Lock, X } from "lucide-react";
import { toast } from "sonner";

import {
  cancelarEnvio,
  detalharEnvio,
  listarEnvios,
  type Envio,
  type EstadoAviso,
} from "@/lib/notificacoes.functions";
import { Button } from "@/components/ui/button";
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

const ROTULO_ESTADO: Record<EstadoAviso, string> = {
  pendente: "Na fila",
  enviando: "Saindo",
  enviada: "Enviada",
  expirada: "Venceu antes de sair",
  falhou: "Não saiu",
  cancelada: "Cancelada",
};

const data = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const porcento = (parte: number, todo: number) =>
  todo === 0 ? "—" : `${Math.round((parte / todo) * 100)}%`;

/**
 * Os envios feitos pelo painel e o que aconteceu com cada um.
 *
 * "Enviada" quer dizer que o serviço de push do Google ou da Apple aceitou;
 * "exibida", que o aparelho confirmou ter mostrado. A distância entre as duas é
 * justamente o que a validação do push quer medir.
 */
export function ListaDeEnvios() {
  const queryClient = useQueryClient();
  const cancelar = useServerFn(cancelarEnvio);
  const [cancelando, setCancelando] = useState<Envio | null>(null);

  const envios = useQuery({
    queryKey: ["notificacoes", "envios"],
    queryFn: () => listarEnvios(),
    // Enquanto houver algo na fila, a lista acompanha sozinha a saída.
    refetchInterval: (consulta) =>
      (consulta.state.data ?? []).some((e) => e.estados.pendente + e.estados.enviando > 0)
        ? 15_000
        : false,
  });

  const mutacao = useMutation({
    mutationFn: (loteId: string) => cancelar({ data: { loteId } }),
    onSuccess: (resultado) => {
      setCancelando(null);
      void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      toast.success(
        resultado.canceladas === 0
          ? "Nada a cancelar: os avisos já tinham saído."
          : resultado.canceladas === 1
            ? "1 aviso cancelado."
            : `${resultado.canceladas} avisos cancelados.`,
      );
    },
    onError: (erro: Error) => {
      setCancelando(null);
      toast.error(erro.message || "Não foi possível cancelar.");
    },
  });

  const lista = envios.data ?? [];

  return (
    <section aria-labelledby="titulo-envios" className="space-y-3">
      <h2 id="titulo-envios" className="text-base font-semibold">
        Envios
      </h2>

      {envios.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando os envios…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum aviso enviado pelo painel ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {lista.map((envio) => (
            <LinhaDeEnvio
              key={envio.loteId}
              envio={envio}
              aoCancelar={() => setCancelando(envio)}
            />
          ))}
        </ul>
      )}

      {/* Um diálogo para a lista inteira, e não um por linha: ver o comentário
          em routes/usuarios.tsx sobre camadas do Radix irmãs travando a tela. */}
      <AlertDialog
        open={cancelando !== null}
        onOpenChange={(aberto) => !aberto && setCancelando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar os avisos que ainda não saíram?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelando &&
                `${cancelando.rotulo}: ${cancelando.estados.pendente} ainda na fila. Os que já saíram continuam nos aparelhos — notificação enviada não volta.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutacao.isPending}
              onClick={(evento) => {
                evento.preventDefault();
                if (cancelando) mutacao.mutate(cancelando.loteId);
              }}
            >
              {mutacao.isPending ? "Cancelando…" : "Cancelar avisos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function LinhaDeEnvio({ envio, aoCancelar }: { envio: Envio; aoCancelar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const { estados } = envio;
  const naFila = estados.pendente + estados.enviando;

  const numeros: [string, string | number, string?][] = [
    ["Na fila", naFila],
    ["Enviadas", estados.enviada],
    // A taxa só existe depois que algo saiu; antes disso, "— das enviadas" não diz nada.
    [
      "Exibidas",
      envio.exibidas,
      estados.enviada ? porcento(envio.exibidas, estados.enviada) + " das enviadas" : undefined,
    ],
    [
      "Abertas",
      envio.abertas,
      estados.enviada ? porcento(envio.abertas, estados.enviada) + " das enviadas" : undefined,
    ],
    ["Não saíram", estados.falhou + estados.expirada],
    ["Canceladas", estados.cancelada],
  ];

  return (
    <li className="rounded-lg border border-border panel-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong className="text-sm">{envio.rotulo}</strong>
        <span className="text-sm text-muted-foreground">
          para {envio.total === 1 ? "1 pessoa" : `${envio.total} pessoas`}, por {envio.criadaPor}
        </span>
        {envio.mostrarDetalhe && (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/60 px-2 text-[11px] text-warning">
            <Lock className="size-3" /> texto na tela bloqueada
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          envio {data(envio.enviarEm)} · vale até {data(envio.validaAte)}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 break-words text-sm text-foreground/80">{envio.detalhe}</p>

      <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {numeros.map(([rotulo, valor, dica]) => (
          // `dt` antes do `dd` no HTML, como o leitor de tela espera; o número
          // sobe na tela pelo `flex-col-reverse`, e o `justify-end` o prende no
          // topo, alinhado entre cartões com rótulos de alturas diferentes.
          <div
            key={rotulo}
            className="flex flex-col-reverse justify-end rounded-md border border-border p-2"
          >
            <dt className="text-[11px] text-muted-foreground">
              {rotulo}
              {dica && <span className="block">{dica}</span>}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={aberto}
          onClick={() => setAberto((atual) => !atual)}
        >
          <ChevronDown className={"size-4 transition-transform " + (aberto ? "rotate-180" : "")} />
          {aberto ? "Ocultar detalhes" : "Por plataforma e por pessoa"}
        </Button>
        {estados.pendente > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={aoCancelar}>
            <X className="size-4" />
            Cancelar {estados.pendente === 1 ? "o pendente" : `os ${estados.pendente} pendentes`}
          </Button>
        )}
      </div>

      {aberto && <DetalheDoEnvio loteId={envio.loteId} atualizando={naFila > 0} />}
    </li>
  );
}

function DetalheDoEnvio({ loteId, atualizando }: { loteId: string; atualizando: boolean }) {
  const detalhe = useQuery({
    queryKey: ["notificacoes", "envio", loteId],
    queryFn: () => detalharEnvio({ data: { loteId } }),
    refetchInterval: atualizando ? 15_000 : false,
  });

  if (detalhe.isLoading) {
    return <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!detalhe.data) {
    return <p className="mt-3 text-sm text-destructive">Não foi possível carregar os detalhes.</p>;
  }

  const { plataformas, pessoas } = detalhe.data;

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-medium">Por plataforma</h3>
        {plataformas.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhum aparelho recebeu tentativa ainda.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Plataforma</th>
                  <th className="py-1 pr-3 font-medium">Aparelhos</th>
                  <th className="py-1 pr-3 font-medium">Aceitas</th>
                  <th className="py-1 pr-3 font-medium">Exibidas</th>
                  <th className="py-1 pr-3 font-medium">Abertas</th>
                  <th className="py-1 pr-3 font-medium">Inscrição morta</th>
                  <th className="py-1 font-medium">Falhas</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {plataformas.map((p) => (
                  <tr key={p.plataforma} className="border-t border-border">
                    <td className="py-1.5 pr-3">{p.plataforma}</td>
                    <td className="py-1.5 pr-3">{p.aparelhos}</td>
                    <td className="py-1.5 pr-3">{p.aceitas}</td>
                    <td className="py-1.5 pr-3">
                      {p.exibidas}{" "}
                      <span className="text-muted-foreground">
                        ({porcento(p.exibidas, p.aceitas)})
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.abertas}{" "}
                      <span className="text-muted-foreground">
                        ({porcento(p.abertas, p.aceitas)})
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{p.inscricoesMortas}</td>
                    <td className="py-1.5">{p.falhas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Aceita: o serviço de push recebeu. Exibida: o aparelho confirmou que mostrou. Inscrição
          morta: o aparelho desinstalou, limpou os dados ou revogou a permissão, e foi removido.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">Por pessoa</h3>
        <ul className="mt-2 divide-y divide-border text-sm">
          {pessoas.map((pessoa, indice) => (
            <li key={`${pessoa.email}-${indice}`} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
              <span className="min-w-0 break-all font-medium">{pessoa.email}</span>
              <span className="text-muted-foreground">{ROTULO_ESTADO[pessoa.estado]}</span>
              {pessoa.exibidaEm && (
                <span className="text-muted-foreground">exibida {data(pessoa.exibidaEm)}</span>
              )}
              {pessoa.abertaEm && (
                <span className="text-muted-foreground">aberta {data(pessoa.abertaEm)}</span>
              )}
              {pessoa.motivo && (
                <span className="basis-full text-xs text-muted-foreground">{pessoa.motivo}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
