import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useState } from "react";

import { GateShell } from "@/components/gate";
import { ApagarConversa } from "@/components/apagar-conversa";
import { exigirAdmin } from "@/lib/guardas";
import { detalharConversa, type MensagemConversa } from "@/lib/conversas.functions";
import { SeloConta, SeloVersao, formatarData } from "./conversas.index";

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

  return (
    <GateShell>
      <div className="space-y-6">
        <Link
          to="/conversas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Todas as conversas
        </Link>

        {conversa.isError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive sm:p-8">
            Não foi possível carregar esta conversa.
          </p>
        ) : conversa.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !sessao ? (
          <p className="rounded-lg border border-dashed border-border p-6 sm:p-8 text-center text-sm text-muted-foreground">
            Conversa não encontrada.
          </p>
        ) : (
          <>
            <div className="border-b border-border pb-4">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <SeloVersao versao={sessao.versao} />
                {sessao.nome}
                <SeloConta usuarioId={sessao.usuarioId} />
              </h2>
              <p className="text-sm text-muted-foreground">
                {formatarData(sessao.iniciadaEm)} · {duracao(sessao.iniciadaEm, sessao.encerradaEm)}
              </p>
              <div className="mt-2 -ml-3">
                <ApagarConversa id={id} />
              </div>

              {sessao.avaliacao && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {sessao.avaliacao.estrelas != null && (
                    <span>Nota {sessao.avaliacao.estrelas}/5</span>
                  )}
                  {sessao.avaliacao.nps != null && <span>NPS {sessao.avaliacao.nps}/10</span>}
                  {sessao.avaliacao.comentario && (
                    <blockquote className="w-full border-l-2 border-primary bg-muted/40 px-3 py-2 text-muted-foreground italic">
                      {sessao.avaliacao.comentario}
                    </blockquote>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {mensagens.map((mensagem) => (
                <Balao key={mensagem._id} mensagem={mensagem} />
              ))}
            </div>
          </>
        )}
      </div>
    </GateShell>
  );
}

function Balao({ mensagem }: { mensagem: MensagemConversa }) {
  const [aberto, setAberto] = useState(false);
  const doBot = mensagem.papel === "bot";
  const trechos = mensagem.trechosDebug ?? [];

  return (
    <div>
      <div className={"flex " + (doBot ? "justify-start" : "justify-end")}>
        <div
          className={
            "max-w-2xl rounded-lg border p-3 text-sm " +
            (doBot
              ? "border-border panel-surface " + (trechos.length ? "cursor-pointer hover:border-primary/50" : "")
              : "border-transparent bg-primary/10")
          }
          onClick={() => trechos.length && setAberto((a) => !a)}
        >
          <p className="whitespace-pre-wrap">{mensagem.texto}</p>

          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>{formatarHora(mensagem.em)}</span>
            {doBot && (
              <>
                <span className={(mensagem.latenciaMs ?? 0) >= 30_000 ? "text-warning" : ""}>
                  {((mensagem.latenciaMs ?? 0) / 1000).toFixed(1)}s
                </span>
                {mensagem.semResposta && <span className="text-warning">não encontrou</span>}
                {/* O motivo aparece aqui porque é onde alguém vai olhar quando o
                    protótipo "não respondeu": distingue demora de token errado
                    sem precisar caçar o log da requisição. */}
                {mensagem.erro && (
                  <span className="text-destructive">
                    falhou: {mensagem.motivoErro ?? "motivo não registrado"}
                  </span>
                )}
                {mensagem.feedback === "up" && <span className="text-success">avaliada como boa</span>}
                {mensagem.feedback === "down" && (
                  <span className="text-destructive">avaliada como ruim</span>
                )}
                {mensagem.feedbackComentario && (
                  <span className="italic">“{mensagem.feedbackComentario}”</span>
                )}
                {trechos.length > 0 && (
                  <span className="text-primary">
                    {aberto ? "ocultar" : `ver as ${trechos.length} perguntas consultadas`}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {aberto && <Trechos mensagem={mensagem} />}
    </div>
  );
}

/**
 * As perguntas da base que a busca trouxe para esta resposta.
 *
 * É a ligação entre os dois painéis: cada linha leva à FAQ que a originou, para
 * quem revisa ir da resposta ruim direto ao documento que precisa de conserto.
 * As cortadas pelo limiar ficam visíveis e apagadas — é justamente ver o que
 * ficou de fora, e por quanto, que permite calibrar o corte com dado real.
 */
function Trechos({ mensagem }: { mensagem: MensagemConversa }) {
  const trechos = mensagem.trechosDebug ?? [];

  return (
    <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        {trechos.length} perguntas consultadas · limiar {mensagem.limiarScore ?? "?"} ·{" "}
        {mensagem.qtdTrechos} usadas na resposta · {mensagem.modelo ?? "modelo não informado"}
      </p>

      <ul className="space-y-1">
        {trechos.map((trecho, indice) => (
          <li
            key={indice}
            className={
              "flex items-center gap-2 text-xs " + (trecho.usado ? "" : "opacity-60")
            }
          >
            <span
              className={
                "w-12 shrink-0 tabular-nums " + (trecho.usado ? "font-semibold text-success" : "")
              }
            >
              {trecho.score.toFixed(3)}
            </span>
            <span className="w-14 shrink-0 text-muted-foreground">
              {trecho.usado ? "usada" : "cortada"}
            </span>
            <span className="w-40 shrink-0 truncate text-muted-foreground">
              {trecho.category ?? "—"}
            </span>
            <span className="min-w-0 flex-1 truncate" title={trecho.previa ?? ""}>
              {trecho.question ?? trecho.previa ?? "—"}
            </span>
            {trecho.faqId && (
              <Link
                to="/faqs/$id"
                params={{ id: trecho.faqId }}
                className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                abrir
                <ExternalLink className="size-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatarHora(valor: string) {
  return new Date(valor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function duracao(inicio: string, fim: string | null) {
  if (!fim) return "em aberto";
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}
