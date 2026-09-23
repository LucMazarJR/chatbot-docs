import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TomDoSelo = "neutro" | "marca" | "sucesso" | "atencao" | "erro";

/**
 * O selo (etiqueta de estado ou de categoria), num formato só.
 *
 * LÓGICA DO LUCIANO: o painel chegou a ter seis jeitos de desenhar uma
 * pílula, cada tela com a sua borda, opacidade e tamanho de letra. Lado a
 * lado, "Avaliada" e "Sem resposta" pareciam de sistemas diferentes. Aqui o
 * tom diz o significado, e o resto é igual para todos.
 */
const TONS: Record<TomDoSelo, string> = {
  neutro: "bg-muted text-muted-foreground",
  marca: "bg-primary-soft text-primary-soft-foreground",
  sucesso: "bg-success-soft text-success",
  atencao: "bg-warning-soft text-warning",
  erro: "bg-destructive-soft text-destructive",
};

export function Selo({
  tom = "neutro",
  icone,
  children,
  className,
  title,
}: {
  tom?: TomDoSelo;
  icone?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold leading-snug [&_svg]:size-3.5",
        TONS[tom],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  );
}
