import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Lock, X } from "lucide-react";

import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Selo, type TomDoSelo } from "@/components/selo";
import { diaEHora } from "@/lib/datas";
import { cn } from "@/lib/utils";
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
import { Carregando } from "@/components/carregando";

const ROTULO_ESTADO: Record<EstadoAviso, string> = {
  pendente: "Na fila",
  enviando: "Saindo",
  enviada: "Enviada",
  expirada: "Venceu antes de sair",
  falhou: "Não saiu",
  cancelada: "Cancelada",
};

const data = (valor: string | null) => (valor ? diaEHora(valor) : "sem data");

const porcento = (parte: number, todo: number) =>
  todo === 0 ? "nenhuma" : `${Math.round((parte / todo) * 100)}%`;

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
      toast.error(erro.message || "Não foi possível cancelar. Confira a internet e tente de novo.");
    },
  });

  const lista = envios.data ?? [];

  return (
    <section aria-labelledby="titulo-envios" className="space-y-3">
      <h2 id="titulo-envios" className="text-lg font-semibold">
        Envios
      </h2>

      {envios.isError ? (
        <EstadoFalha onTentarDeNovo={() => envios.refetch()} tentando={envios.isFetching}>
          Não foi possível carregar os envios. Confira a internet e tente de novo.
        </EstadoFalha>
      ) : envios.isLoading ? (
        <Carregando texto="Carregando os envios…" />
      ) : lista.length === 0 ? (
        <EstadoVazio titulo="Nenhum aviso enviado ainda">
          Cada aviso enviado aqui aparece nesta lista, com quantas pessoas viram e abriram.
        </EstadoVazio>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
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
                `${cancelando.rotulo}: ${cancelando.estados.pendente} ainda na fila. Os que já saíram continuam nos aparelhos: notificação enviada não volta.`}
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

/** O estado do lote em uma palavra, quando ainda não há o que medir. */
function estadoDoLote(envio: Envio): { texto: string; tom: TomDoSelo } | null {
  const { estados } = envio;
  if (estados.pendente + estados.enviando > 0 && estados.enviada === 0)
    return { texto: estados.enviando > 0 ? "Saindo" : "Na fila", tom: "marca" };
  if (estados.enviada > 0) return null;
  if (estados.cancelada > 0 && estados.falhou + estados.expirada === 0)
    return { texto: "Cancelado", tom: "neutro" };
  return { texto: "Não saiu", tom: "erro" };
}

/**
 * Um envio como linha: tipo, para quantos, quando e o quanto chegou.
 *
 * A barra junta os dois números que a validação do push quer medir: quantos
 * apareceram no aparelho e quantos foram abertos, sobre os que saíram. Os
 * seis números e as tabelas ficam no detalhe, que abre na própria linha.
 */
function LinhaDeEnvio({ envio, aoCancelar }: { envio: Envio; aoCancelar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const { estados } = envio;
  const naFila = estados.pendente + estados.enviando;
  const estado = estadoDoLote(envio);
  const saiu = estados.enviada;
  const largura = (parte: number) => (saiu ? `${Math.min(100, (parte / saiu) * 100)}%` : "0%");
  const idDetalhe = `envio-${envio.loteId}`;

  const numeros: [string, string | number, string?][] = [
    ["Na fila", naFila],
    ["Enviadas", estados.enviada],
    // A taxa só existe depois que algo saiu; antes disso, "das enviadas" não diz nada.
    [
      "Apareceram",
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
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        onClick={() => setAberto((atual) => !atual)}
        className="grid w-full grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left text-[15px] transition-colors hover:bg-surface-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_120px_140px_260px_20px] lg:py-3"
      >
        <span className="min-w-0">
          <strong className="font-semibold">{envio.rotulo}</strong>
          <span className="block text-sm text-muted-foreground">
            por {envio.criadaPor}
            {envio.mostrarDetalhe && " · texto na tela bloqueada"}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "row-span-2 size-[18px] text-muted-foreground transition-transform lg:order-last lg:row-span-1",
            aberto && "rotate-180",
          )}
        />
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm lg:contents lg:text-[15px]">
          <span>{envio.total === 1 ? "1 pessoa" : `${envio.total} pessoas`}</span>
          <span className="text-muted-foreground">{data(envio.enviarEm)}</span>
          {estado ? (
            <Selo tom={estado.tom}>{estado.texto}</Selo>
          ) : (
            <span className="flex w-full flex-col gap-1 sm:w-64 lg:w-auto">
              <span
                aria-hidden="true"
                className="flex h-2 overflow-hidden rounded-full bg-muted"
              >
                <span className="bg-primary" style={{ width: largura(envio.abertas) }} />
                <span
                  className="bg-primary/45"
                  style={{ width: largura(Math.max(0, envio.exibidas - envio.abertas)) }}
                />
              </span>
              <span className="text-[13px] text-muted-foreground">
                {envio.exibidas} {envio.exibidas === 1 ? "apareceu" : "apareceram"} ·{" "}
                {envio.abertas} {envio.abertas === 1 ? "aberta" : "abertas"}
                {naFila > 0 && ` · ${naFila} na fila`}
              </span>
            </span>
          )}
        </span>
      </button>

      {aberto && (
        <div id={idDetalhe} className="space-y-4 border-t border-border bg-surface-2 px-4 py-4 sm:px-5">
          {envio.mostrarDetalhe && (
            <Selo tom="atencao" icone={<Lock aria-hidden="true" />}>
              Texto visível na tela bloqueada
            </Selo>
          )}
          <p className="break-words text-[15px]">{envio.detalhe}</p>
          <p className="text-sm text-muted-foreground">Vale até {data(envio.validaAte)}.</p>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {numeros.map(([rotulo, valor, dica]) => (
              // `dt` antes do `dd` no HTML, como o leitor de tela espera; o número
              // sobe na tela pelo `flex-col-reverse`, e o `justify-end` o prende no
              // topo, alinhado entre cartões com rótulos de alturas diferentes.
              <div
                key={rotulo}
                className="flex flex-col-reverse justify-end rounded-lg border border-border bg-card p-2.5"
              >
                <dt className="text-[13px] text-muted-foreground">
                  {rotulo}
                  {dica && <span className="block">{dica}</span>}
                </dt>
                <dd className="text-xl font-semibold tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>

          {estados.pendente > 0 && (
            <Button type="button" variant="perigo" onClick={aoCancelar}>
              <X />
              Cancelar {estados.pendente === 1 ? "o pendente" : `os ${estados.pendente} pendentes`}
            </Button>
          )}

          <DetalheDoEnvio loteId={envio.loteId} atualizando={naFila > 0} />
        </div>
      )}
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
    return <Carregando compacto texto="Carregando o detalhe do envio…" />;
  }
  if (!detalhe.data) {
    return (
      <EstadoFalha onTentarDeNovo={() => detalhe.refetch()} tentando={detalhe.isFetching}>
        Não foi possível carregar o detalhe por plataforma e por pessoa. Tente de novo.
      </EstadoFalha>
    );
  }

  const { plataformas, pessoas } = detalhe.data;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">Por plataforma</h3>
        {plataformas.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhum aparelho recebeu tentativa ainda.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-[13px] text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Plataforma</th>
                  <th className="py-1 pr-3 font-medium">Aparelhos</th>
                  <th className="py-1 pr-3 font-medium">Aceitas</th>
                  <th className="py-1 pr-3 font-medium">Apareceram</th>
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
        <p className="mt-2 text-sm text-muted-foreground">
          Aceita: o serviço de push recebeu. Apareceu: o aparelho confirmou que mostrou. Inscrição
          morta: o aparelho desinstalou, limpou os dados ou revogou a permissão, e foi removido.
        </p>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold">Por pessoa</h3>
        <ul className="mt-2 divide-y divide-border text-sm">
          {pessoas.map((pessoa, indice) => (
            <li key={`${pessoa.email}-${indice}`} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
              <span className="min-w-0 break-all font-medium">{pessoa.email}</span>
              <span className="text-muted-foreground">{ROTULO_ESTADO[pessoa.estado]}</span>
              {pessoa.exibidaEm && (
                <span className="text-muted-foreground">apareceu {data(pessoa.exibidaEm)}</span>
              )}
              {pessoa.abertaEm && (
                <span className="text-muted-foreground">aberta {data(pessoa.abertaEm)}</span>
              )}
              {pessoa.motivo && (
                <span className="basis-full text-sm text-muted-foreground">{pessoa.motivo}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
