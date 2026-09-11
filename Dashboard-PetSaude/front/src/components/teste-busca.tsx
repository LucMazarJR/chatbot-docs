import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, FlaskConical } from "lucide-react";

import { testarBusca, type ResultadoBusca } from "@/lib/faq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePodeEscrever } from "@/components/gate";

/**
 * Rodar a busca do chatbot sem passar pelo chatbot.
 *
 * LÓGICA DO LUCIANO: a única forma de saber por que o chatbot não respondeu
 * alguma coisa era mandar a pergunta pelo chat e esperar. Isso custa minutos,
 * depende do n8n estar de pé, e não mostra os scores — dá para ver que falhou,
 * não por quanto.
 *
 * E o "por quanto" é a informação que decide o trabalho. Nas 81 perguntas do
 * primeiro teste com participantes, casos como "Onde fica a UBS?" (0,816) e
 * "Onde consigo um pedido de tomografia?" (0,819) tinham a FAQ certa na base e
 * ficaram milésimos abaixo do corte de 0,82. Sem ver o número, esses casos e os
 * de conteúdo realmente faltando são indistinguíveis — e a correção de cada um é
 * oposta à do outro.
 *
 * Fechado por padrão: gasta um embedding por teste, na mesma cota diária que a
 * ingestão e o chatbot dividem.
 */
export function TesteDeBusca() {
  const podeEscrever = usePodeEscrever();
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const testar = useServerFn(testarBusca);

  const busca = useMutation({
    mutationFn: (texto: string) => testar({ data: { pergunta: texto } }),
  });

  // Editor e admin escrevem FAQ; leitor não tem o que fazer com o resultado, e
  // a chamada gasta cota.
  if (!podeEscrever) return null;

  const enviar = () => {
    const texto = pergunta.trim();
    if (texto.length < 2 || busca.isPending) return;
    busca.mutate(texto);
  };

  return (
    <section className="rounded-lg border border-border panel-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="size-4" />
          Testar como o chatbot busca
        </span>
        {aberto ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-sm text-muted-foreground">
            Escreva a pergunta como um cidadão escreveria. A busca é a mesma do chatbot, com o
            mesmo corte de relevância — o que aparecer aqui é o que ele teria para responder.
          </p>

          <div className="flex flex-wrap gap-2">
            <Input
              value={pergunta}
              maxLength={300}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Ex.: Onde fica a UBS?"
              className="min-w-[16rem] flex-1"
            />
            <Button onClick={enviar} disabled={busca.isPending || pergunta.trim().length < 2}>
              {busca.isPending ? "Buscando…" : "Buscar"}
            </Button>
          </div>

          {busca.isError && (
            <p className="text-sm text-destructive">
              {(busca.error as Error).message || "Não foi possível testar agora."}
            </p>
          )}

          {busca.data && <Resultado dados={busca.data} />}
        </div>
      )}
    </section>
  );
}

function Resultado({ dados }: { dados: ResultadoBusca }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {dados.quantosPassam === 0 ? (
          <span className="text-destructive">
            Nenhum trecho passou do corte de {dados.limiar.toFixed(2)}. O chatbot responderia que
            não encontrou.
          </span>
        ) : (
          <span>
            {dados.quantosPassam}{" "}
            {dados.quantosPassam === 1 ? "trecho passou" : "trechos passaram"} do corte de{" "}
            {dados.limiar.toFixed(2)} e {dados.quantosPassam === 1 ? "iria" : "iriam"} para a
            resposta.
          </span>
        )}
      </p>

      <ul className="space-y-2">
        {dados.trechos.map((trecho) => (
          <li
            key={trecho.id}
            className={`rounded-lg border p-3 ${
              trecho.passaria ? "border-success/40 bg-success/5" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link
                to="/faqs/$id"
                params={{ id: trecho.id }}
                className="min-w-0 text-sm font-medium hover:underline"
              >
                {trecho.question || "(sem pergunta)"}
              </Link>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums ${
                  trecho.passaria
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {trecho.score.toFixed(3)}
                {trecho.passaria ? " · usado" : " · cortado"}
              </span>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {trecho.category ?? "Sem assunto"}
              {/* A busca do fluxo não filtra por isActive: uma FAQ desativada
                  pode voltar aqui e ir para a resposta do chatbot. */}
              {!trecho.ativa && " · desativada, mas ainda encontrada pela busca"}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Modelo: {dados.modelo}. Um teste = um embedding da cota diária.
      </p>
    </div>
  );
}
