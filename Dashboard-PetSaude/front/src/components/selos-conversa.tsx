import { Building2, Lock } from "lucide-react";

import { Selo } from "@/components/selo";

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

/** De qual unidade veio a conversa. Quem não respondeu não ganha selo nenhum. */
export function SeloUbs({ nome, texto }: { nome?: string | null; texto?: string | null }) {
  if (nome) {
    return (
      <Selo tom="marca" icone={<Building2 aria-hidden="true" />}>
        {nome}
      </Selo>
    );
  }
  if (!texto) return null;
  return (
    <Selo
      tom="atencao"
      icone={<Building2 aria-hidden="true" />}
      title="Identifique em Unidades de saúde"
    >
      UBS a identificar
    </Selo>
  );
}
