import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { GateShell } from "@/components/gate";
import { ApagarConversa } from "@/components/apagar-conversa";
import { exigirAdmin } from "@/lib/guardas";
import { detalharConversa, type MensagemConversa } from "@/lib/conversas.functions";
import { SeloConta, SeloVersao } from "@/components/selos-conversa";
import { diaEHora, hora } from "@/lib/datas";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Selo } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conversas/$id")({
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Conversa | Central de FAQs" }] }),
  component: ConversaPage,
});

function ConversaPage() {
  const { id } = Route.useParams();

  const conversa = useQuery({
    queryKey: ["conversa", id],
    queryFn: () => detalharConversa({ data: { id } }),
  });

  const sessao = conversa.data?.sessao;
  const mensagens = conversa.data?.mensagens ?? [];

  // A resposta cujos bastidores aparecem ao lado. Começa na primeira que
  // consultou a base, que é a que costuma interessar.
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const respostas = mensagens.filter((m) => m.papel === "bot");
  const padrao = respostas.find((m) => (m.trechosDebug ?? []).length > 0) ?? respostas[0];
  const selecionada = respostas.find((m) => m._id === escolhida) ?? padrao;

  const voltar = (
    <Button asChild variant="outline" size="icon" aria-label="Voltar para Conversas">
      <Link to="/conversas">
        <ArrowLeft />
      </Link>
    </Button>
  );

  return (
    <GateShell>
      <div className="space-y-5">
        {conversa.isError ? (
          <>
            <CabecalhoPagina titulo="Conversa" antes={voltar} />
            <EstadoFalha onTentarDeNovo={() => conversa.refetch()} tentando={conversa.isFetching}>
              Não foi possível carregar esta conversa. Confira a internet e tente de novo.
            </EstadoFalha>
          </>
        ) : conversa.isLoading ? (
          <Carregando texto="Carregando a conversa…" />
        ) : !sessao ? (
          <>
            <CabecalhoPagina titulo="Conversa" antes={voltar} />
            <EstadoVazio
              titulo="Conversa não encontrada"
              acao={
                <Button asChild variant="outline">
                  <Link to="/conversas">Ver todas as conversas</Link>
                </Button>
              }
            >
              Ela pode ter sido apagada a pedido da pessoa.
            </EstadoVazio>
          </>
        ) : (
          <>
            <CabecalhoPagina
              antes={voltar}
              titulo={sessao.nome}
              selos={
                <>
                  <SeloVersao versao={sessao.versao} />
                  <SeloConta usuarioId={sessao.usuarioId} />
                </>
              }
              frase={
                <span className="text-sm sm:text-[15px]">
                  {diaEHora(sessao.iniciadaEm)} · {duracao(sessao.iniciadaEm, sessao.encerradaEm)}
                  {sessao.avaliacao?.estrelas != null && ` · nota ${sessao.avaliacao.estrelas}`}
                  {sessao.avaliacao?.nps != null &&
                    ` · recomendaria ${sessao.avaliacao.nps} de 10`}
                </span>
              }
              acoes={<ApagarConversa id={id} />}
            />

            {sessao.avaliacao?.comentario && (
              <blockquote className="rounded-xl border-l-4 border-primary bg-card px-4 py-3 text-[15px] italic text-muted-foreground">
                “{sessao.avaliacao.comentario}”
              </blockquote>
            )}

            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <section
                aria-label="O que a pessoa viu"
                className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border"
              >
                <div className="flex items-center gap-2.5 bg-chat-topo px-4 py-2.5 text-chat-topo-texto">
                  <img
                    src="/logo-pet-saude.png"
                    alt=""
                    width={34}
                    height={34}
                    className="size-[34px] rounded-full bg-white"
                  />
                  <span className="leading-tight">
                    <strong className="block text-[15px]">Assistente de Saúde</strong>
                    <span className="text-[13px] opacity-90">o que a pessoa viu</span>
                  </span>
                </div>
                <div className="flex flex-col gap-2 bg-chat-fundo px-3 py-4 sm:px-5">
                  {mensagens.length === 0 ? (
                    <p className="py-6 text-center text-sm text-chat-fraco">
                      A pessoa abriu o chat e saiu sem perguntar nada.
                    </p>
                  ) : (
                    mensagens.map((mensagem) => (
                      <Balao
                        key={mensagem._id}
                        mensagem={mensagem}
                        selecionada={mensagem._id === selecionada?._id}
                        aoEscolher={() => {
                          setEscolhida(mensagem._id);
                          // No celular os bastidores ficam depois da conversa
                          // inteira: sem rolar até eles, o toque parecia não
                          // fazer nada.
                          if (window.matchMedia("(max-width: 1023px)").matches) {
                            requestAnimationFrame(() =>
                              document
                                .getElementById("titulo-bastidores")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                            );
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </section>

              {selecionada && <Bastidores mensagem={selecionada} />}
            </div>
          </>
        )}
      </div>
    </GateShell>
  );
}

/** *negrito* como o chat mostra. */
function formatarComoNoChat(texto: string): ReactNode {
  return texto.split("*").map((parte, i) =>
    i % 2 ? <strong key={i}>{parte}</strong> : <Fragment key={i}>{parte}</Fragment>,
  );
}

function Balao({
  mensagem,
  selecionada,
  aoEscolher,
}: {
  mensagem: MensagemConversa;
  selecionada: boolean;
  aoEscolher: () => void;
}) {
  const doBot = mensagem.papel === "bot";
  const conteudo = (
    <>
      <span className="whitespace-pre-wrap break-words">{formatarComoNoChat(mensagem.texto)}</span>
      <span className="mt-0.5 block text-right text-xs text-chat-fraco">{hora(mensagem.em)}</span>
    </>
  );
  const balao =
    "max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-2 text-[15px] leading-relaxed text-chat-texto shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[78%]";

  if (!doBot) {
    return <div className={cn(balao, "self-end bg-chat-saida")}>{conteudo}</div>;
  }

  return (
    <div className="flex max-w-full flex-col items-start gap-1 self-start">
      {/* A resposta é um botão: escolhê-la troca os bastidores ao lado. */}
      <button
        type="button"
        onClick={aoEscolher}
        aria-pressed={selecionada}
        aria-label={`Ver os bastidores da resposta das ${hora(mensagem.em)}`}
        className={cn(
          balao,
          "max-w-full bg-chat-entrada text-left sm:max-w-[78%]",
          selecionada && "outline outline-[3px] outline-offset-2 outline-primary",
        )}
      >
        {conteudo}
      </button>
      <MarcasDaResposta mensagem={mensagem} />
    </div>
  );
}

/** O que aconteceu com a resposta, embaixo dela: só o que existir. */
function MarcasDaResposta({ mensagem }: { mensagem: MensagemConversa }) {
  const lenta = (mensagem.latenciaMs ?? 0) >= 30_000;
  const marcas: ReactNode[] = [];
  if (mensagem.semResposta) marcas.push(<Selo tom="atencao">Não encontrou</Selo>);
  // O motivo aparece aqui porque é onde alguém vai olhar quando o chatbot "não
  // respondeu": distingue demora de token errado sem caçar o log.
  if (mensagem.erro)
    marcas.push(
      <Selo tom="erro" className="whitespace-normal">
        Falhou: {mensagem.motivoErro ?? "motivo não registrado"}
      </Selo>,
    );
  if (lenta)
    marcas.push(
      <Selo tom="atencao">{((mensagem.latenciaMs ?? 0) / 1000).toFixed(0)} s para responder</Selo>,
    );
  if (mensagem.feedback === "up") marcas.push(<Selo tom="sucesso">Avaliada como boa</Selo>);
  if (mensagem.feedback === "down") marcas.push(<Selo tom="erro">Avaliada como ruim</Selo>);
  if (marcas.length === 0 && !mensagem.feedbackComentario) return null;

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5 pl-1">
      {marcas.map((marca, i) => (
        <Fragment key={i}>{marca}</Fragment>
      ))}
      {mensagem.feedbackComentario && (
        <span className="text-sm italic text-chat-fraco">“{mensagem.feedbackComentario}”</span>
      )}
    </div>
  );
}

/**
 * As perguntas da base que a busca trouxe para a resposta escolhida.
 *
 * É a ligação entre a conversa e a base: cada item leva à FAQ que o originou,
 * para quem revisa ir da resposta ruim direto ao que precisa de conserto. As
 * que ficaram abaixo do corte aparecem também, porque ver o que ficou de fora,
 * e por quanto, é o que permite calibrar o corte com dado real.
 */
function Bastidores({ mensagem }: { mensagem: MensagemConversa }) {
  const trechos = mensagem.trechosDebug ?? [];
  const limiar = mensagem.limiarScore;
  const segundos = mensagem.latenciaMs != null ? Math.round(mensagem.latenciaMs / 1000) : null;

  return (
    <aside
      aria-labelledby="titulo-bastidores"
      className="flex w-full flex-col gap-3.5 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-20 lg:w-[380px] lg:shrink-0"
    >
      <h2 id="titulo-bastidores" className="scroll-mt-20 text-lg font-semibold">
        Bastidores da resposta das {hora(mensagem.em)}
      </h2>
      {trechos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {mensagem.erro
            ? "Esta resposta falhou antes de consultar a base."
            : "Esta resposta não consultou a base: é uma saudação ou foi registrada antes de os bastidores serem gravados."}
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            As perguntas da base que a busca trouxe, com a proximidade de cada uma.
            {limiar != null && ` O corte é ${limiar.toFixed(2).replace(".", ",")}.`}
          </p>
          <ul className="flex flex-col gap-2">
            {trechos.map((trecho, indice) => {
              const nota = trecho.score.toFixed(2).replace(".", ",");
              const corpo = (
                <>
                  <Selo tom={trecho.usado ? "sucesso" : "neutro"}>
                    {trecho.usado ? "Usada" : "Abaixo do corte"} · {nota}
                  </Selo>
                  <span className="text-sm leading-snug">
                    {trecho.question ?? trecho.previa ?? "Pergunta sem texto"}
                  </span>
                  {trecho.category && (
                    <span className="text-[13px] text-muted-foreground">{trecho.category}</span>
                  )}
                </>
              );
              const caixa =
                "flex flex-col gap-1.5 rounded-lg border border-border px-3.5 py-3 text-foreground";
              return (
                <li key={indice}>
                  {trecho.faqId ? (
                    <Link
                      to="/faqs/$id"
                      params={{ id: trecho.faqId }}
                      className={cn(caixa, "transition-colors hover:bg-surface-2")}
                    >
                      {corpo}
                    </Link>
                  ) : (
                    <div className={caixa}>{corpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
        <Clock aria-hidden="true" className="size-4 shrink-0" />
        {segundos != null ? `Respondeu em ${segundos} s` : "Tempo não registrado"}
        {mensagem.modelo ? ` · ${mensagem.modelo}` : ""}
      </p>
    </aside>
  );
}

function duracao(inicio: string, fim: string | null) {
  if (!fim) return "em aberto";
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}
