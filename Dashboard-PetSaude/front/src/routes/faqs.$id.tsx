import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { GateShell } from "@/components/gate";
import { FaqCard } from "@/components/faq-shared";
import { exigirSessao } from "@/lib/guardas";
import { getFaq } from "@/lib/faq.functions";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha } from "@/components/estado";
import { Button } from "@/components/ui/button";

/**
 * Uma pergunta isolada, com o cartão completo e os mesmos
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
      <div className="space-y-5">
        <CabecalhoPagina
          antes={
            <Button asChild variant="outline" size="icon" aria-label="Voltar para as perguntas">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
          }
          titulo="Pergunta"
          frase="Como está na base que o chatbot lê para responder."
        />

        {faq.isError ? (
          <EstadoFalha onTentarDeNovo={() => faq.refetch()} tentando={faq.isFetching}>
            Não foi possível abrir esta pergunta. Ela pode ter sido excluída depois da conversa; se
            não foi, confira a internet e tente de novo.
          </EstadoFalha>
        ) : faq.isLoading ? (
          <Carregando texto="Carregando a pergunta…" />
        ) : faq.data ? (
          <ul>
            <FaqCard faq={faq.data} />
          </ul>
        ) : null}
      </div>
    </GateShell>
  );
}
