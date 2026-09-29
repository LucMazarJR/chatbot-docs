import type { ReactNode } from "react";

/**
 * Um número com o que dá sentido a ele.
 *
 * Um número solto ("84") não diz se é bom ou ruim. O cartão responde a uma
 * pergunta e traz na linha de baixo o contexto. Só o que pede atenção ganha cor.
 */
export function CartaoNumero({
  rotulo,
  valor,
  contexto,
  tom,
}: {
  rotulo: string;
  valor: string;
  contexto: ReactNode;
  tom?: "warning" | "destructive";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 lg:px-5 lg:py-[18px]">
      <span className="text-sm font-medium text-muted-foreground">{rotulo}</span>
      <strong
        className={
          "text-[26px] font-semibold leading-tight lg:text-[32px] " +
          (tom === "warning" ? "text-warning" : tom === "destructive" ? "text-destructive" : "")
        }
      >
        {valor}
      </strong>
      <span className="text-sm text-muted-foreground">{contexto}</span>
    </div>
  );
}
