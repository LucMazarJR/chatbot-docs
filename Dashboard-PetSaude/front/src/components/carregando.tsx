import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sinal de que algo está chegando.
 *
 * LÓGICA DO LUCIANO: o painel inteiro dizia "Carregando…" num texto cinza, igual
 * a qualquer legenda, e em duas telas nem isso: a lista de FAQs mostrava
 * "0 resultados" e os números de Conversas surgiam do nada, empurrando a tela.
 * Um componente só, com o giro e a frase do que está vindo, para toda espera se
 * parecer com espera.
 *
 * `role="status"` anuncia ao leitor de tela sem interromper. `compacto` é para
 * dentro de um cartão ou ao lado de outro conteúdo; o padrão ocupa o lugar do
 * que vai aparecer, para a tela não pular quando os dados chegam.
 */
export function Carregando({
  texto = "Carregando…",
  compacto = false,
  className,
}: {
  texto?: string;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        compacto ? "py-1" : "justify-center py-10",
        className,
      )}
    >
      <Loader2
        aria-hidden="true"
        className="size-4 shrink-0 animate-spin text-primary motion-reduce:[animation-duration:2.4s]"
      />
      <span>{texto}</span>
    </p>
  );
}
