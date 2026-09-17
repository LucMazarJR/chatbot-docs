import { createFileRoute } from "@tanstack/react-router";

import { GateShell } from "@/components/gate";
import { FormularioAviso } from "@/components/notificacoes/formulario-aviso";
import { ListaDeEnvios } from "@/components/notificacoes/lista-de-envios";
import { exigirAdmin } from "@/lib/guardas";

export const Route = createFileRoute("/notificacoes")({
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Avisos | Central de FAQs" }] }),
  component: NotificacoesPage,
});

/**
 * Avisos push para quem tem conta no chat.
 *
 * Em validação: por enquanto só existe conta no /staging do PWA, e a tela serve
 * para medir se o push chega de verdade em cada tipo de aparelho antes de o
 * projeto contar com ele para lembrar alguém de um exame.
 */
function NotificacoesPage() {
  return (
    <GateShell>
      <div className="space-y-8">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            Avisos
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
              em teste
            </span>
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Notificações no celular de quem tem conta no chat de testes e ativou os avisos no
            aparelho. Servem para lembrar de exames e consultas, e para medir em quais aparelhos
            elas chegam de verdade.
          </p>
        </div>

        <FormularioAviso />
        <ListaDeEnvios />
      </div>
    </GateShell>
  );
}
