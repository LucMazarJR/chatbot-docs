import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock, Search, TriangleAlert } from "lucide-react";
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
import { EstadoFalha } from "@/components/estado";
import { Segmentos } from "@/components/segmentos";
import { diaDaSemanaEHora } from "@/lib/datas";
import { cn } from "@/lib/utils";

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

const ETAPAS = ["O quê", "Para quem", "Quando"] as const;

/** O que um `<input type="datetime-local">` entende: data e hora locais, sem fuso. */
function paraCampoLocal(data: Date): string {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

const pessoas = (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`);

/**
 * Agendar um aviso, em três etapas curtas: o quê, para quem, quando.
 *
 * LÓGICA DO LUCIANO: era um formulário único de sete blocos, e o botão de
 * enviar ficava no fim, longe de tudo. Em etapas, cada tela pede uma decisão,
 * e a prévia ao lado mostra o resultado de todas o tempo inteiro.
 *
 * As duas decisões que mais importam continuam à vista. A primeira é o que
 * aparece na tela bloqueada: a prévia mostra o texto discreto que sai por
 * padrão, e marcar "mostrar o texto" exibe o alerta de que qualquer um perto
 * do celular vai ler. A segunda é a validade: sem ela, um lembrete que atrasou
 * chegaria depois da consulta, e a pessoa poderia acreditar nele.
 */
export function FormularioAviso() {
  const queryClient = useQueryClient();
  const agendar = useServerFn(agendarAviso);

  const destinatarios = useQuery({
    queryKey: ["notificacoes", "destinatarios"],
    queryFn: () => listarDestinatarios(),
  });
  const contas = useMemo(() => destinatarios.data?.contas ?? [], [destinatarios.data]);

  const [etapa, setEtapa] = useState(0);
  const [falta, setFalta] = useState<string | null>(null);
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

  /** O que falta em cada etapa, dito em frase: o botão nunca fica travado sem motivo. */
  const faltaNa = (n: number): string | null => {
    if (n === 0 && !detalhe.trim()) return "Escreva o texto do aviso.";
    if (n === 1) {
      if (destinatarios.isLoading) return "Espere a lista de quem pode receber carregar.";
      if (contas.length === 0) return "Ainda não há ninguém com os avisos ativados.";
      if (quantidade === 0) return "Marque ao menos uma pessoa, ou escolha todas.";
    }
    if (n === 2) {
      if (!datasValidas) return "Preencha a data e a hora.";
      if (validaAte.getTime() <= enviarEm.getTime())
        return "A validade precisa terminar depois do envio.";
    }
    return null;
  };

  const irPara = (destino: number) => {
    // Voltar é sempre livre; avançar só passando pelas etapas no caminho.
    for (let n = etapa; n < destino; n += 1) {
      const motivo = faltaNa(n);
      if (motivo) {
        setEtapa(n);
        setFalta(motivo);
        return;
      }
    }
    setFalta(null);
    setEtapa(destino);
  };

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
      setEtapa(0);
      void queryClient.invalidateQueries({ queryKey: ["notificacoes", "envios"] });
      toast.success(
        momento === "agora"
          ? `Aviso enviado para a fila: ${pessoas(resultado.criadas)}. Sai em até 30 segundos.`
          : `Aviso agendado para ${pessoas(resultado.criadas)}.`,
      );
    },
    onError: (erro: Error) => {
      setConfirmando(false);
      toast.error(
        erro.message || "Não foi possível agendar o aviso. Confira a internet e tente de novo.",
      );
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
  const ultima = etapa === ETAPAS.length - 1;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <form
        aria-labelledby="titulo-etapa"
        className="flex min-w-0 flex-1 flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!ultima) return irPara(etapa + 1);
          const motivo = faltaNa(0) ?? faltaNa(1) ?? faltaNa(2);
          if (motivo) {
            setFalta(motivo);
            return;
          }
          setFalta(null);
          setConfirmando(true);
        }}
      >
        <ol className="flex flex-wrap gap-x-7 gap-y-2" aria-label="Etapas">
          {ETAPAS.map((nome, n) => {
            const feita = n < etapa;
            const atual = n === etapa;
            return (
              <li key={nome}>
                <button
                  type="button"
                  onClick={() => irPara(n)}
                  aria-current={atual ? "step" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 text-[15px] font-semibold",
                    atual || feita ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm",
                      feita
                        ? "bg-success text-success-foreground"
                        : atual
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {feita ? <Check className="size-3.5" strokeWidth={3} /> : n + 1}
                  </span>
                  {nome}
                  {feita && <span className="sr-only">(feita)</span>}
                </button>
              </li>
            );
          })}
        </ol>

        {etapa === 0 && (
          <>
            <h2 id="titulo-etapa" className="text-xl font-semibold">
              O que você quer avisar?
            </h2>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">Tipo</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {TIPOS_DA_EQUIPE.map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-[15px] has-checked:border-primary has-checked:bg-primary-soft"
                  >
                    <input
                      type="radio"
                      name="tipo"
                      className="mt-1 size-4 accent-primary"
                      checked={tipo === id}
                      onChange={() => setTipo(id)}
                    />
                    <span>
                      <span className="block font-semibold">{TIPOS[id].rotulo}</span>
                      <span className="block text-sm text-muted-foreground">
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
                onChange={(evento) => {
                  setDetalhe(evento.target.value);
                  setFalta(null);
                }}
                placeholder="Ex.: Sua coleta de sangue é amanhã, às 7h, na UBS Centro. Venha em jejum de 8 horas."
                aria-describedby="aviso-detalhe-dica"
                aria-invalid={falta !== null && !detalhe.trim() ? true : undefined}
              />
              <p
                id="aviso-detalhe-dica"
                className="flex justify-between gap-4 text-sm text-muted-foreground"
              >
                <span>A pessoa lê o texto dentro do chat, com a conta aberta.</span>
                <span className="shrink-0 tabular-nums">
                  {detalhe.length}/{DETALHE_MAXIMO}
                </span>
              </p>

              <label className="flex items-start gap-2.5 pt-1 text-[15px]">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={mostrarDetalhe}
                  onChange={(evento) => setMostrarDetalhe(evento.target.checked)}
                />
                <span>
                  Mostrar o texto também na tela bloqueada
                  <span className="block text-sm text-muted-foreground">
                    Desligado, a notificação diz só “{TIPOS[tipo].titulo}”.
                  </span>
                </span>
              </label>
              {mostrarDetalhe && (
                <p className="flex gap-2.5 rounded-lg bg-warning-soft p-3 text-sm text-foreground">
                  <TriangleAlert className="size-[18px] shrink-0 text-warning" />
                  <span>
                    Qualquer pessoa perto do celular vai ler este texto sem desbloquear. Não use
                    para nada que diga qual exame, consulta ou condição de saúde a pessoa tem.
                  </span>
                </p>
              )}
            </div>
          </>
        )}

        {etapa === 1 && (
          <>
            <h2 id="titulo-etapa" className="text-xl font-semibold">
              Para quem vai o {TIPOS[tipo].rotulo.toLowerCase()}?
            </h2>
            {destinatarios.isError ? (
              <EstadoFalha
                onTentarDeNovo={() => destinatarios.refetch()}
                tentando={destinatarios.isFetching}
              >
                Não foi possível carregar quem pode receber. Confira a internet e tente de novo.
              </EstadoFalha>
            ) : destinatarios.isLoading ? (
              <Carregando compacto texto="Carregando quem pode receber…" />
            ) : contas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-[15px] text-muted-foreground">
                Ninguém ativou os avisos ainda. A pessoa precisa entrar no chat em{" "}
                <code>/staging</code>, abrir <strong>Avisos</strong> no menu e tocar em{" "}
                <strong>Ativar avisos neste aparelho</strong>, no aparelho em que quer receber.
                {(destinatarios.data?.contasSemAparelho ?? 0) > 0 &&
                  ` Há ${pessoas(destinatarios.data!.contasSemAparelho)} com conta, mas sem aparelho ativado.`}
              </p>
            ) : (
              <>
                <Segmentos
                  rotulo="Quem recebe"
                  opcoes={[
                    { valor: "escolher", rotulo: "Escolher pessoas" },
                    {
                      valor: "todos",
                      rotulo: `Todas com avisos ativos (${contas.length})`,
                    },
                  ]}
                  valor={quem}
                  aoMudar={(valor) => {
                    setQuem(valor);
                    setFalta(null);
                  }}
                  className="self-start"
                />

                {quem === "escolher" && (
                  <div className="flex flex-col gap-3">
                    {contas.length > 6 && (
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="search"
                          value={busca}
                          onChange={(evento) => setBusca(evento.target.value)}
                          placeholder="Procurar por e-mail ou nome"
                          aria-label="Procurar pessoa"
                          className="bg-background pl-10"
                        />
                      </div>
                    )}
                    <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                      {visiveis.map((conta) => (
                        <li key={conta.id}>
                          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3.5 py-2 text-[15px] hover:bg-surface-2">
                            <input
                              type="checkbox"
                              className="size-[18px] shrink-0 accent-primary"
                              checked={escolhidos.has(conta.id)}
                              onChange={() => {
                                alternar(conta.id);
                                setFalta(null);
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block break-all font-semibold">
                                {conta.email}
                                {conta.nome && (
                                  <span className="font-normal text-muted-foreground">
                                    {" "}
                                    · {conta.nome}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[13px] text-muted-foreground">
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
                        <li className="px-3.5 py-4 text-[15px] text-muted-foreground">
                          Ninguém com esse e-mail ou nome.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {etapa === 2 && (
          <>
            <h2 id="titulo-etapa" className="text-xl font-semibold">
              Quando enviar?
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <fieldset className="space-y-2.5">
                <legend className="mb-2 text-sm font-semibold">Envio</legend>
                <Segmentos
                  rotulo="Quando enviar"
                  opcoes={[
                    { valor: "agora", rotulo: "Agora" },
                    { valor: "agendar", rotulo: "Agendar" },
                  ]}
                  valor={momento}
                  aoMudar={(valor) => {
                    setMomento(valor);
                    setFalta(null);
                  }}
                />
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

              <div className="space-y-2.5">
                <Label htmlFor="aviso-validade">Vale até</Label>
                <select
                  id="aviso-validade"
                  value={validade}
                  onChange={(evento) => setValidade(evento.target.value as IdValidade)}
                  aria-describedby="aviso-validade-dica"
                  className="flex h-11 w-full rounded-md border border-input bg-card px-3.5 text-[15px]"
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
                <p id="aviso-validade-dica" className="text-sm text-muted-foreground">
                  Se não sair até lá (servidor desligado, aparelho sem sinal), o aviso é descartado
                  em vez de chegar atrasado.
                </p>
              </div>
            </div>
          </>
        )}

        {falta && (
          <p role="alert" className="text-[15px] font-semibold text-destructive">
            {falta}
          </p>
        )}

        <div className="mt-auto flex flex-wrap justify-between gap-3 border-t border-border pt-4">
          {etapa > 0 ? (
            <Button type="button" variant="outline" onClick={() => irPara(etapa - 1)}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={mutacao.isPending}>
            {!ultima
              ? `Continuar: ${ETAPAS[etapa + 1].toLowerCase()}`
              : momento === "agora"
                ? "Enviar aviso"
                : "Agendar aviso"}
          </Button>
        </div>
      </form>

      <Previa
        tipo={tipo}
        textoNaTela={textoNaTela}
        detalhe={detalhe.trim()}
        quantidade={quantidade}
        envio={
          !datasValidas
            ? "a definir"
            : momento === "agora"
              ? "assim que confirmar"
              : diaDaSemanaEHora(enviarEm)
        }
        validade={datasValidas ? diaDaSemanaEHora(validaAte) : "a definir"}
      />

      <AlertDialog open={confirmando} onOpenChange={(aberto) => !aberto && setConfirmando(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {momento === "agora" ? "Enviar" : "Agendar"} para {pessoas(quantidade)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {TIPOS[tipo].rotulo}
              {momento === "agora" ? ", saindo agora" : `, em ${diaDaSemanaEHora(enviarEm)}`},
              válido até {diaDaSemanaEHora(validaAte)}. Depois que sai, não dá para desfazer; até
              lá, dá para cancelar na lista de envios.
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
    </div>
  );
}

/** O resultado das três etapas, sempre à vista enquanto a pessoa preenche. */
function Previa({
  tipo,
  textoNaTela,
  detalhe,
  quantidade,
  envio,
  validade,
}: {
  tipo: TipoDaEquipe;
  textoNaTela: string;
  detalhe: string;
  quantidade: number;
  envio: string;
  validade: string;
}) {
  return (
    <aside
      aria-labelledby="titulo-previa"
      className="flex w-full flex-col gap-3.5 rounded-xl border border-border bg-card p-5 sm:p-6 lg:sticky lg:top-20 lg:w-[340px] lg:shrink-0"
    >
      <h2 id="titulo-previa" className="text-base font-semibold">
        Prévia
      </h2>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock aria-hidden="true" className="size-[15px]" /> Na tela bloqueada
      </span>
      {/* Cor fixa nos dois temas: é a tela do celular, não do painel. */}
      <div className="flex gap-3 rounded-2xl bg-[#1c1d33] p-3.5 text-white">
        <img
          src="/logo-pet-saude.png"
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-[10px] bg-white"
        />
        <span className="min-w-0 text-[15px]">
          <span className="block text-[13px] opacity-80">Assistente de Saúde · agora</span>
          <strong className="block">{TIPOS[tipo].titulo}</strong>
          <span className="line-clamp-3 block break-words opacity-90">{textoNaTela}</span>
        </span>
      </div>
      <span className="text-sm text-muted-foreground">Dentro do app</span>
      <p className="rounded-lg bg-background p-3.5 text-[15px] leading-relaxed">
        {detalhe || (
          <span className="text-muted-foreground">O texto que você escrever aparece aqui.</span>
        )}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[15px]">
        <dt className="text-muted-foreground">Tipo</dt>
        <dd>{TIPOS[tipo].rotulo}</dd>
        <dt className="text-muted-foreground">Para</dt>
        <dd>{quantidade > 0 ? pessoas(quantidade) : "a definir"}</dd>
        <dt className="text-muted-foreground">Envio</dt>
        <dd>{envio}</dd>
        <dt className="text-muted-foreground">Vale até</dt>
        <dd>{validade}</dd>
      </dl>
    </aside>
  );
}
