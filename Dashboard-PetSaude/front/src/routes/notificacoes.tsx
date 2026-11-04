import { createFileRoute } from "@tanstack/react-router";

import { GateShell } from "@/components/gate";
import { FormularioAviso } from "@/components/notificacoes/formulario-aviso";
import { ListaDeEnvios } from "@/components/notificacoes/lista-de-envios";
import { exigirAdmin } from "@/lib/guardas";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Selo } from "@/components/selo";

export const Route = createFileRoute("/notificacoes")({
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Avisos | Central de FAQs" }] }),
  component: NotificacoesPage,
});

/**
 * Avisos push para quem tem conta no chat.
 *
 * Em validação: só existe conta no /staging do PWA, e a tela serve para medir
 * se o push chega de verdade em cada tipo de aparelho antes de o projeto
 * contar com ele para lembrar alguém de um exame.
 */
function NotificacoesPage() {
  return (
    <GateShell>
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="Avisos"
          selos={<Selo tom="marca">Em teste</Selo>}
          frase="Lembretes no celular de quem tem conta no chat de testes e ativou os avisos. Servem para lembrar de exames e consultas, e para medir em quais aparelhos chegam de verdade."
        />
        <FormularioAviso />
        <ListaDeEnvios />
      </div>
    </GateShell>
  );
}
