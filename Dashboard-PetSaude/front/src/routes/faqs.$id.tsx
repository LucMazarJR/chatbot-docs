import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { GateShell } from "@/components/gate";
import { FaqCard } from "@/components/faq-shared";
import { exigirSessao } from "@/lib/guardas";
import { getFaq } from "@/lib/faq.functions";

/**
 * Uma pergunta isolada, com o mesmo cartão da listagem — e portanto os mesmos
 * botões de editar e excluir.
 *
 * O destino dos links vindos da tela de conversas: da resposta ruim direto ao
 * documento que precisa de conserto. A listagem não serviria, porque muitas
 * perguntas têm texto idêntico entre assuntos diferentes.
 */
export const Route = createFileRoute("/faqs/$id")({
  beforeLoad: () => exigirSessao(),
  head: () => ({ meta: [{ title: "Pergunta | Central de FAQs" }] }),
  component: FaqPage,
});

function FaqPage() {
  const { id } = Route.useParams();

  const faq = useQuery({
    queryKey: ["faq", id],
    queryFn: () => getFaq({ data: { id } }),
  });

  return (
    <GateShell>
      <div className="space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Todas as perguntas
        </Link>

        {faq.isError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive sm:p-8">
            Pergunta não encontrada. Ela pode ter sido excluída depois da conversa.
          </p>
        ) : faq.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : faq.data ? (
          <FaqCard faq={faq.data} />
        ) : null}
      </div>
    </GateShell>
  );
}
