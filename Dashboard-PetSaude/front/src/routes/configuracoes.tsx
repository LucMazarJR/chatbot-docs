import { createFileRoute } from "@tanstack/react-router";

import { GateShell } from "@/components/gate";
import { ScriptEditor } from "@/components/script-editor";
import { SaudeEmbeddings } from "@/components/saude-embeddings";
import { exigirPermissao } from "@/lib/guardas";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";

export const Route = createFileRoute("/configuracoes")({
  // A decisão acontece antes de renderizar, inclusive no SSR. A barreira real
  // continua sendo o backend, que exige a área Configurações nas rotas de
  // script e de embeddings.
  beforeLoad: () => exigirPermissao("configuracoes"),
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
