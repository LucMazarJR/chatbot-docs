import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Lista ou busca que voltou sem nada.
 *
 * Só aparece DEPOIS que a resposta chegou vazia: durante a espera é o
 * `Carregando`, e na falha é o `EstadoFalha`. Mostrar "nada aqui" enquanto os
 * dados ainda vêm faz a pessoa ir embora antes de eles chegarem.
 */
export function EstadoVazio({
  titulo,
  children,
  acao,
  className,
}: {
  titulo: string;
  /** O que esperar, ou o que fazer para aparecer algo aqui. */
  children?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-8 text-center",
        className,
      )}
    >
      <strong className="text-[15px] font-semibold text-foreground">{titulo}</strong>
      {children && <p className="max-w-prose text-sm text-muted-foreground">{children}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

/**
 * A busca falhou. Diz o que aconteceu e oferece tentar de novo no mesmo lugar.
 *
 * Falha nunca aparece como lista vazia: "nenhuma sugestão" quando o servidor
 * caiu faz a equipe achar que não há trabalho, e ela não volta para conferir.
 */
export function EstadoFalha({
  children = "Não foi possível carregar. Confira a internet e tente de novo.",
  onTentarDeNovo,
  tentando,
  className,
}: {
  children?: ReactNode;
  onTentarDeNovo?: () => void;
  tentando?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive",
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {onTentarDeNovo && (
        <button
          type="button"
          onClick={onTentarDeNovo}
          disabled={tentando}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-current px-3 text-sm font-semibold transition-colors hover:bg-destructive/10 disabled:opacity-60 sm:min-h-9"
        >
          <RotateCw aria-hidden="true" className={cn("size-4", tentando && "animate-spin")} />
          {tentando ? "Tentando…" : "Tentar de novo"}
        </button>
      )}
    </div>
  );
}
