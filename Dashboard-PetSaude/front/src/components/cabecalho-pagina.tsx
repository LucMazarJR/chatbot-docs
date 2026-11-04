import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * O topo de toda tela: título, uma frase sobre o que ela é, e as ações.
 *
 * As ações ficam sempre à direita e no mesmo lugar. Antes cada tela punha o
 * botão principal onde cabia (no título, embaixo da lista, dentro de um
 * cartão), e quem troca de tela precisava procurar de novo.
 */
export function CabecalhoPagina({
  titulo,
  frase,
  acoes,
  antes,
  selos,
  className,
}: {
  titulo: ReactNode;
  frase?: ReactNode;
  acoes?: ReactNode;
  /** Antes do título, como o botão de voltar numa tela de detalhe. */
  antes?: ReactNode;
  /** Ao lado do título, como "Em teste". */
  selos?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {antes}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-[26px]">
              {titulo}
            </h1>
            {selos}
          </div>
          {frase && <p className="mt-1.5 text-base text-muted-foreground">{frase}</p>}
        </div>
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap gap-2.5">{acoes}</div>}
    </header>
  );
}
