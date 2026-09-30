import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  registrarExportacaoConversa,
  type ConversaResumida,
  type MensagemConversa,
} from "@/lib/conversas.functions";

/**
 * Baixa a conversa em PDF, para mandar a quem acompanha o teste sem usar o painel.
 *
 * O registro no histórico vem antes do arquivo: a conversa sai do painel e vai
 * circular, e esse é o acesso que mais precisa ficar anotado. Se o registro
 * falhar, o PDF não é montado.
 */
export function BaixarConversa({
  sessao,
  mensagens,
}: {
  sessao: ConversaResumida;
  mensagens: MensagemConversa[];
}) {
  const registrar = useServerFn(registrarExportacaoConversa);
  const [baixando, setBaixando] = useState(false);

  async function baixar() {
    setBaixando(true);
    try {
      try {
        await registrar({ data: { id: sessao._id } });
      } catch (erro) {
        toast.error(
          erro instanceof Error && erro.message
            ? erro.message
            : "Não foi possível registrar o download no histórico. Confira a internet e tente de novo.",
        );
        return;
      }
      // Carregada só aqui: a biblioteca de PDF pesa perto de 1 MB.
      const { baixarConversaEmPdf } = await import("@/lib/pdf/conversa-pdf");
      await baixarConversaEmPdf(sessao, mensagens);
      toast.success("PDF baixado. Ele está na pasta de downloads do navegador.");
    } catch (erro) {
      console.error("Falha ao montar o PDF da conversa", erro);
      toast.error("Não foi possível montar o PDF. Tente de novo; se continuar, recarregue a página.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={() => void baixar()}
      disabled={baixando}
      className="min-h-11 sm:min-h-9"
    >
      <Download />
      {baixando ? "Montando o PDF…" : "Baixar PDF"}
    </Button>
  );
}
