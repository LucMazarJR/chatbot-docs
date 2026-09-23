import { createFileRoute } from "@tanstack/react-router";

import { GateShell } from "@/components/gate";
import { ScriptEditor } from "@/components/script-editor";
import { SaudeEmbeddings } from "@/components/saude-embeddings";
import { exigirAdmin } from "@/lib/guardas";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";

export const Route = createFileRoute("/configuracoes")({
  // Mesmo guarda de /usuarios: a decisão acontece antes de renderizar, inclusive
  // no SSR. A barreira real continua sendo o backend, que exige papel admin nas
  // rotas de script e de embeddings.
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Configurações | Central de FAQs" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <GateShell>
      <div className="space-y-8">
        <CabecalhoPagina
          titulo="Configurações"
          frase="Como os documentos viram perguntas, e a saúde da base que o chatbot consulta."
        />

        <ScriptEditor />

        <hr className="border-border" />

        <SaudeEmbeddings />
      </div>
    </GateShell>
  );
}
