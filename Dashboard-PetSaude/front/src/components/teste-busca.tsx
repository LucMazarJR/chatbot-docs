import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, X } from "lucide-react";

import { testarBusca, type ResultadoBusca } from "@/lib/faq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePodeEscrever } from "@/components/gate";
import { Selo } from "@/components/selo";

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
 * Só aparece quando alguém abre pelo botão da barra de busca: cada teste gasta
 * um embedding, na mesma cota diária que a ingestão e o chatbot dividem.
 */
export function TesteDeBusca({ aoFechar }: { aoFechar: () => void }) {
  const podeEscrever = usePodeEscrever();
  const [pergunta, setPergunta] = useState("");
  const [tentouVazio, setTentouVazio] = useState(false);
  const testar = useServerFn(testarBusca);

  const busca = useMutation({
    mutationFn: (texto: string) => testar({ data: { pergunta: texto } }),
  });

  // Editor e admin escrevem FAQ; leitor não tem o que fazer com o resultado, e
  // a chamada gasta cota.
  if (!podeEscrever) return null;

  const enviar = () => {
    const texto = pergunta.trim();
    if (busca.isPending) return;
    if (texto.length < 2) {
      setTentouVazio(true);
      return;
    }
    busca.mutate(texto);
  };

  return (
    <section
      id="teste-de-busca"
      aria-labelledby="titulo-teste-busca"
      className="rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-2">
        <h2 id="titulo-teste-busca" className="flex items-center gap-2 text-base font-semibold">
          <FlaskConical className="size-[18px]" />
          Testar a busca do chatbot
        </h2>
        <Button variant="ghost" size="icon" aria-label="Fechar o teste de busca" onClick={aoFechar}>
          <X />
        </Button>
      </div>

      {(
        <div className="space-y-4 p-4">
          <p className="text-[15px] text-muted-foreground">
            Escreva a pergunta como um cidadão escreveria. A busca é a mesma do chatbot, com o
            mesmo corte de relevância: o que aparecer aqui é o que ele teria para responder.
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
            <Button onClick={enviar} disabled={busca.isPending}>
              {busca.isPending ? "Buscando…" : "Buscar"}
            </Button>
          </div>

          {/* O botão aceita o toque e a frase diz o que falta: um botão apagado
              não explica nada. */}
          {tentouVazio && pergunta.trim().length < 2 && (
            <p className="text-sm text-warning">Escreva a pergunta, com ao menos duas letras.</p>
          )}

          {busca.isError && (
            <p className="text-sm text-destructive">
              {(busca.error as Error).message ||
                "Não foi possível testar agora. Confira a internet e tente de novo."}
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
            className="rounded-lg border border-border p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link
                to="/faqs/$id"
                params={{ id: trecho.id }}
                className="min-w-0 text-sm font-medium hover:underline"
              >
                {trecho.question || "(sem pergunta)"}
              </Link>
              <Selo tom={trecho.passaria ? "sucesso" : "neutro"} className="tabular-nums">
                {trecho.passaria ? "Usado" : "Abaixo do corte"} · {trecho.score.toFixed(3)}
              </Selo>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">
              {trecho.category ?? "Sem assunto"}
              {/* A busca do fluxo não filtra por isActive: uma FAQ desativada
                  pode voltar aqui e ir para a resposta do chatbot. */}
              {!trecho.ativa && " · desativada, mas ainda encontrada pela busca"}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        Modelo: {dados.modelo}. Um teste = um embedding da cota diária.
      </p>
    </div>
  );
}
