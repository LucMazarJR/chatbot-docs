import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { baixarModeloExcel, baixarModeloWord } from "@/lib/modelo-vazio";
import { lerModeloDoScript, type ModeloDoScript } from "@/lib/sandbox";

/**
 * Baixa os modelos vazios a partir do script ativo.
 *
 * LÓGICA DO LUCIANO: o `modelo` é lido do próprio script, no sandbox, na hora do
 * clique — não fica em cache. Assim, trocar o script muda o arquivo baixado no
 * mesmo instante. É o ponto de o modelo morar dentro do script: com um .xlsx
 * estático, a primeira mudança de formato deixaria o modelo desatualizado e o
 * erro só apareceria depois de alguém preencher 200 linhas na planilha errada.
 */
export function ModeloBotoes({
  codigo,
  desabilitado,
}: {
  codigo: string | undefined;
  desabilitado?: boolean;
}) {
  const [gerando, setGerando] = useState<"xlsx" | "docx" | null>(null);

  const gerar = async (formato: "xlsx" | "docx") => {
    if (!codigo) {
      toast.error("A leitura de documentos nao esta configurada.");
      return;
    }

    setGerando(formato);
    try {
      let modelo: ModeloDoScript | null = null;
      try {
        modelo = await lerModeloDoScript(codigo);
      } catch (erro) {
        // Script sem `modelo` ainda deve conseguir gerar um arquivo: as colunas
        // padrão cobrem o caso, e um aviso é melhor que um botão que não faz
        // nada. Quem editou o script vai querer saber que esqueceu do export.
        toast.warning("A regra nao descreve o formato. Gerando com o modelo padrao.", {
          description: erro instanceof Error ? erro.message : undefined,
        });
      }

      if (formato === "xlsx") await baixarModeloExcel(modelo);
      else await baixarModeloWord(modelo);
    } catch (erro) {
      toast.error("Nao foi possivel gerar o modelo", {
        description: erro instanceof Error ? erro.message : String(erro),
      });
    } finally {
      setGerando(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={desabilitado || gerando !== null}
        onClick={() => void gerar("xlsx")}
      >
        <FileSpreadsheet className="size-4" />
        {gerando === "xlsx" ? "Gerando…" : "Modelo em Excel"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={desabilitado || gerando !== null}
        onClick={() => void gerar("docx")}
      >
        <FileText className="size-4" />
        {gerando === "docx" ? "Gerando…" : "Modelo em Word"}
      </Button>
    </div>
  );
}
