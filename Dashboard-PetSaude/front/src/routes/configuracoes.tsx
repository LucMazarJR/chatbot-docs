import { createFileRoute } from "@tanstack/react-router";

import { GateShell } from "@/components/gate";
import { ScriptEditor } from "@/components/script-editor";
import { SaudeEmbeddings } from "@/components/saude-embeddings";
import { exigirAdmin } from "@/lib/guardas";

export const Route = createFileRoute("/configuracoes")({
  // Mesmo guarda de /usuarios: a decisão acontece antes de renderizar, inclusive
  // no SSR. A barreira real continua sendo o backend, que exige papel admin nas
  // rotas de script e de embeddings.
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Configuracoes | Central de FAQs" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <GateShell>
      <div className="space-y-10">
        <div>
          <h1 className="text-2xl font-semibold">Configuracoes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Como os documentos viram FAQs, e a saude vetorial da base que o chatbot consulta.
          </p>
        </div>

        <ScriptEditor />

        <hr className="border-border" />

        <SaudeEmbeddings />
      </div>
    </GateShell>
  );
}
