import { Lock } from "lucide-react";

import { Selo } from "@/components/selo";
import { cn } from "@/lib/utils";

/**
 * Marca a conversa feita com conta, sem dizer de quem.
 *
 * Saber que a conversa tem conta ajuda a ler os números (quem tem conta volta,
 * quem é anônimo raramente volta). Saber QUEM é não ajuda a analisar resposta
 * nenhuma, e expõe o relato de saúde de uma pessoa identificada a quem só
 * precisava avaliar o assistente.
 */
export function SeloConta({ usuarioId }: { usuarioId?: string }) {
  if (!usuarioId) return null;
  return (
    <Selo icone={<Lock aria-hidden="true" />} title="Conversa feita com conta">
      Com conta
    </Selo>
  );
}

export function SeloVersao({ versao, className }: { versao?: "a" | "b"; className?: string }) {
  // Sessões anteriores às duas interfaces não têm o campo: contam como "a",
  // que era a única que existia.
  const letra = (versao ?? "a").toUpperCase();
  return (
    <span
      title={`Interface ${letra}`}
      aria-label={`Interface ${letra}`}
      className={cn(
        "inline-grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold",
        versao === "b"
          ? "bg-warning-soft text-warning"
          : "bg-primary-soft text-primary-soft-foreground",
        className,
      )}
    >
      {letra}
    </span>
  );
}
