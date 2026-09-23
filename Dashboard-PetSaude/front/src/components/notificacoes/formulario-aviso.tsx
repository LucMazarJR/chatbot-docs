import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Lock, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  agendarAviso,
  DETALHE_MAXIMO,
  listarDestinatarios,
  TIPOS,
  TIPOS_DA_EQUIPE,
  type TipoDaEquipe,
} from "@/lib/notificacoes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const HORA = 60 * 60 * 1000;

const VALIDADES = [
  { id: "1h", rotulo: "1 hora depois", ms: HORA },
  { id: "6h", rotulo: "6 horas depois", ms: 6 * HORA },
  { id: "1d", rotulo: "1 dia depois", ms: 24 * HORA },
  { id: "3d", rotulo: "3 dias depois", ms: 3 * 24 * HORA },
  { id: "7d", rotulo: "1 semana depois", ms: 7 * 24 * HORA },
  { id: "data", rotulo: "Até uma data", ms: 0 },
] as const;

type IdValidade = (typeof VALIDADES)[number]["id"];

/** O que um `<input type="datetime-local">` entende: data e hora locais, sem fuso. */
function paraCampoLocal(data: Date): string {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

const quando = (data: Date) =>
  data.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const pessoas = (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`);

/**
 * Agendar um aviso.
 *
 * LÓGICA DO LUCIANO: as duas decisões que mais importam ficam à vista, e não
 * escondidas em opções avançadas. A primeira é o que aparece na tela bloqueada:
 * a prévia mostra o texto discreto que sai por padrão, e marcar "mostrar o
 * texto" exibe o aviso de que qualquer um perto do celular vai ler. A segunda é
 * a validade: sem ela, um lembrete que atrasou chegaria depois da consulta, e a
 * pessoa poderia acreditar nele.
 */
export function FormularioAviso() {
  const queryClient = useQueryClient();
  const agendar = useServerFn(agendarAviso);

  const destinatarios = useQuery({
    queryKey: ["notificacoes", "destinatarios"],
    queryFn: () => listarDestinatarios(),
  });
  const contas = useMemo(() => destinatarios.data?.contas ?? [], [destinatarios.data]);

  const [tipo, setTipo] = useState<TipoDaEquipe>("lembrete-exame");
  const [detalhe, setDetalhe] = useState("");
  const [mostrarDetalhe, setMostrarDetalhe] = useState(false);
  const [quem, setQuem] = useState<"todos" | "escolher">("escolher");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [momento, setMomento] = useState<"agora" | "agendar">("agora");
  const [enviarEmLocal, setEnviarEmLocal] = useState(() =>
    paraCampoLocal(new Date(Date.now() + HORA)),
  );
  const [validade, setValidade] = useState<IdValidade>("1d");
  const [validaAteLocal, setValidaAteLocal] = useState(() =>
    paraCampoLocal(new Date(Date.now() + 25 * HORA)),
  );
  const [confirmando, setConfirmando] = useState(false);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contas;
    return contas.filter(
      (conta) =>
        conta.email.toLowerCase().includes(termo) ||
        (conta.nome ?? "").toLowerCase().includes(termo),
    );
  }, [busca, contas]);

  // Quem sumiu da lista (apagou a conta, desativou o último aparelho) não conta.
  const escolhidosValidos = contas.filter((conta) => escolhidos.has(conta.id)).map((c) => c.id);
  const quantidade = quem === "todos" ? contas.length : escolhidosValidos.length;

  const enviarEm = momento === "agora" ? new Date() : new Date(enviarEmLocal);
  const preset = VALIDADES.find((v) => v.id === validade)!;
  const validaAte =
    validade === "data" ? new Date(validaAteLocal) : new Date(enviarEm.getTime() + preset.ms);
  const datasValidas = !Number.isNaN(enviarEm.getTime()) && !Number.isNaN(validaAte.getTime());

  const faltando = !detalhe.trim()
    ? "Escreva o texto do aviso."
    : quantidade === 0
      ? "Escolha quem recebe."
      : !datasValidas
        ? "Preencha as datas."
        : null;

  const mutacao = useMutation({
    mutationFn: () =>
      agendar({
        data: {
          tipo,
          detalhe: detalhe.trim(),
          mostrarDetalhe,
          todos: quem === "todos",
          destinatarios: escolhidosValidos,
          ...(momento === "agendar" ? { enviarEm: enviarEm.toISOString() } : {}),
          // "Agora" é medido de novo no servidor; a validade relativa vai
          // calculada a partir deste instante, que difere dele por segundos.
          validaAte: validaAte.toISOString(),
        },
      }),
    onSuccess: (resultado) => {
      setConfirmando(false);
      setDetalhe("");
      setMostrarDetalhe(false);
      setEscolhidos(new Set());
      void queryClient.invalidateQueries({ queryKey: ["notificacoes", "envios"] });
      toast.success(
        momento === "agora"
          ? `Aviso enviado para a fila: ${pessoas(resultado.criadas)}. Sai em até 30 segundos.`
          : `Aviso agendado para ${pessoas(resultado.criadas)}.`,
      );
    },
    onError: (erro: Error) => {
      setConfirmando(false);
      toast.error(erro.message || "Não foi possível agendar o aviso.");
    },
  });

  const alternar = (id: string) =>
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const textoNaTela = mostrarDetalhe && detalhe.trim() ? detalhe.trim() : TIPOS[tipo].corpo;

  return (
    <section
      aria-labelledby="titulo-novo-aviso"
      className="rounded-lg border border-border panel-surface p-4 sm:p-6"
    >
      <h2 id="titulo-novo-aviso" className="text-base font-semibold">
        Novo aviso
      </h2>

      <form
        className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!faltando) setConfirmando(true);
        }}
      >
        <div className="min-w-0 space-y-6">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tipo</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS_DA_EQUIPE.map((id) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="tipo"
                    className="mt-1"
                    checked={tipo === id}
                    onChange={() => setTipo(id)}
                  />
                  <span>
                    <span className="block font-medium">{TIPOS[id].rotulo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {TIPOS[id].descricao}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="aviso-detalhe">Texto</Label>
            <Textarea
              id="aviso-detalhe"
              value={detalhe}
              rows={4}
              maxLength={DETALHE_MAXIMO}
              onChange={(evento) => setDetalhe(evento.target.value)}
              placeholder="Ex.: Sua coleta de sangue é amanhã, às 7h, na UBS Centro. Venha em jejum de 8 horas."
              aria-describedby="aviso-detalhe-dica"
            />
            <p
              id="aviso-detalhe-dica"
              className="flex justify-between gap-4 text-xs text-muted-foreground"
            >
              <span>A pessoa lê o texto dentro do chat, com a conta aberta.</span>
              <span className="shrink-0 tabular-nums">
                {detalhe.length}/{DETALHE_MAXIMO}
              </span>
            </p>

            <label className="flex items-start gap-2 pt-1 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={mostrarDetalhe}
                onChange={(evento) => setMostrarDetalhe(evento.target.checked)}
              />
              <span>
                Mostrar o texto também na tela bloqueada
                <span className="block text-xs text-muted-foreground">
                  Desligado, a notificação diz só “{TIPOS[tipo].titulo}”.
                </span>
              </span>
            </label>
            {mostrarDetalhe && (
              <p className="flex gap-2 rounded-md border border-warning/60 bg-warning/10 p-3 text-xs">
                <TriangleAlert className="size-4 shrink-0 text-warning" />
                <span>
                  Qualquer pessoa perto do celular vai ler este texto sem desbloquear. Não use para
                  nada que diga qual exame, consulta ou condição de saúde a pessoa tem.
                </span>
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Quem recebe</legend>

            {destinatarios.isLoading ? (
              <Carregando compacto texto="Carregando quem pode receber…" />
            ) : contas.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Ninguém ativou os avisos ainda. A pessoa precisa entrar no chat em{" "}
                <code>/staging</code>, abrir <strong>Avisos</strong> no menu e tocar em{" "}
                <strong>Ativar avisos neste aparelho</strong>, no aparelho em que quer receber.
                {(destinatarios.data?.contasSemAparelho ?? 0) > 0 &&
                  ` Há ${pessoas(destinatarios.data!.contasSemAparelho)} com conta, mas sem aparelho ativado.`}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="quem"
                      checked={quem === "escolher"}
                      onChange={() => setQuem("escolher")}
                    />
                    Escolher pessoas
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="quem"
                      checked={quem === "todos"}
                      onChange={() => setQuem("todos")}
                    />
                    Todas as contas com avisos ativados ({contas.length})
                  </label>
                </div>

                {quem === "escolher" && (
                  <div className="rounded-md border border-border">
                    {contas.length > 6 && (
                      <div className="relative border-b border-border p-2">
                        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={busca}
                          onChange={(evento) => setBusca(evento.target.value)}
                          placeholder="Procurar por e-mail ou nome"
                          aria-label="Procurar pessoa"
                          className="pl-8"
                        />
                      </div>
                    )}
                    <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                      {visiveis.map((conta) => (
                        <li key={conta.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-accent/50">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={escolhidos.has(conta.id)}
                              onChange={() => alternar(conta.id)}
                            />
                            <span className="min-w-0">
                              <span className="block break-all font-medium">
                                {conta.email}
                                {conta.nome && (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    · {conta.nome}
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {conta.aparelhos === 1
                                  ? "1 aparelho"
                                  : `${conta.aparelhos} aparelhos`}{" "}
                                · {conta.plataformas.join(", ")}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                      {visiveis.length === 0 && (
                        <li className="px-3 py-4 text-sm text-muted-foreground">
                          Ninguém com esse e-mail ou nome.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Quando enviar</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="momento"
                    checked={momento === "agora"}
                    onChange={() => setMomento("agora")}
                  />
                  Agora
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="momento"
                    checked={momento === "agendar"}
                    onChange={() => setMomento("agendar")}
                  />
                  Agendar
                </label>
              </div>
              {momento === "agendar" && (
                <Input
                  type="datetime-local"
                  aria-label="Data e hora do envio"
                  value={enviarEmLocal}
                  min={paraCampoLocal(new Date())}
                  onChange={(evento) => setEnviarEmLocal(evento.target.value)}
                />
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="aviso-validade">Vale até</Label>
              <select
                id="aviso-validade"
                value={validade}
                onChange={(evento) => setValidade(evento.target.value as IdValidade)}
                aria-describedby="aviso-validade-dica"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {VALIDADES.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
              {validade === "data" && (
                <Input
                  type="datetime-local"
                  aria-label="Data e hora limite"
                  value={validaAteLocal}
                  min={paraCampoLocal(new Date())}
                  onChange={(evento) => setValidaAteLocal(evento.target.value)}
                />
              )}
              <p id="aviso-validade-dica" className="text-xs text-muted-foreground">
                Se não sair até lá — servidor desligado, aparelho sem sinal —, o aviso é descartado
                em vez de chegar atrasado.
              </p>
            </div>
          </div>
        </div>

        <aside aria-label="Prévia" className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Como aparece na tela bloqueada
            </p>
            <div className="rounded-2xl bg-foreground/90 p-3 text-background shadow-sm">
              <div className="flex gap-3 rounded-xl bg-background/15 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BellRing className="size-4" />
                </span>
                <span className="min-w-0 text-sm">
                  <span className="block text-[11px] opacity-80">Assistente de Saúde · agora</span>
                  <span className="block font-semibold">{TIPOS[tipo].titulo}</span>
                  <span className="line-clamp-3 block break-words opacity-90">{textoNaTela}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Para:</span> {pessoas(quantidade)}
            </p>
            {datasValidas && (
              <>
                <p>
                  <span className="text-muted-foreground">Envio:</span>{" "}
                  {momento === "agora" ? "agora" : quando(enviarEm)}
                </p>
                <p>
                  <span className="text-muted-foreground">Vale até:</span> {quando(validaAte)}
                </p>
              </>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={Boolean(faltando) || mutacao.isPending}
          >
            {momento === "agora" ? "Enviar aviso" : "Agendar aviso"}
          </Button>
          {faltando && <p className="text-xs text-muted-foreground">{faltando}</p>}
        </aside>
      </form>

      <AlertDialog open={confirmando} onOpenChange={(aberto) => !aberto && setConfirmando(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {momento === "agora" ? "Enviar" : "Agendar"} para {pessoas(quantidade)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {TIPOS[tipo].rotulo}
              {momento === "agora" ? ", saindo agora" : `, em ${quando(enviarEm)}`}, válido até{" "}
              {quando(validaAte)}. Depois que sai, não dá para desfazer; até lá, dá para cancelar na
              lista de envios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutacao.isPending}
              onClick={(evento) => {
                evento.preventDefault();
                mutacao.mutate();
              }}
            >
              {mutacao.isPending ? "Enviando…" : momento === "agora" ? "Enviar" : "Agendar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
