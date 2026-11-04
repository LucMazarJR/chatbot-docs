import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { listFaqs, SEM_CATEGORIA } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import { FaqPagination } from "@/components/faq-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { FaqLinha, InsertFaqButton, SearchField } from "@/components/faq-shared";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Button } from "@/components/ui/button";
import { exigirSessao } from "@/lib/guardas";
import { Carregando } from "@/components/carregando";

const POR_PAGINA = 20;

type Busca = { page?: number; search?: string };

export const Route = createFileRoute("/categorias/$categoria")({
  beforeLoad: () => exigirSessao(),
  validateSearch: (search: Record<string, unknown>): Busca => {
    const page = Number(search.page ?? 1) || 1;
    const termo = typeof search.search === "string" ? search.search : "";
    // Ver o comentário em routes/index.tsx: devolver os padrões faz o roteador
    // redirecionar 307 em toda visita.
    return {
      ...(page > 1 ? { page } : {}),
      ...(termo ? { search: termo } : {}),
    };
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.categoria} | Central de FAQs` },
      {
        name: "description",
        content: `Perguntas frequentes cadastradas na categoria ${params.categoria}, com opções de editar, excluir e inserir novas perguntas.`,
      },
      { property: "og:title", content: `${params.categoria} | Central de FAQs` },
      {
        property: "og:description",
        content: `Todas as perguntas frequentes da categoria ${params.categoria}.`,
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { categoria } = Route.useParams();
  const { page = 1, search = "" } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [termo, setTermo] = useState(search);
  const termoAtrasado = useDebouncedValue(termo, 300);

  // "Sem categoria" não é o nome de uma categoria, é a ausência dela. Sem a
  // sentinela, o backend procuraria por uma categoria literalmente chamada
  // "Sem categoria" e devolveria zero linhas.
  const categoriaConsulta = categoria === "Sem categoria" ? SEM_CATEGORIA : categoria;

  const faqsQuery = useQuery({
    queryKey: ["faqs", { page, search: termoAtrasado, category: categoriaConsulta }],
    queryFn: () =>
      listFaqs({
        data: { page, limit: POR_PAGINA, search: termoAtrasado, category: categoriaConsulta },
      }),
    placeholderData: keepPreviousData,
  });

  const faqs = faqsQuery.data?.items ?? [];
  const total = faqsQuery.data?.total ?? 0;
  const totalPaginas = faqsQuery.data?.totalPages ?? 1;

  const aplicarBusca = (valor: string) => {
    setTermo(valor);
    // `replace: true`: sem ele, cada tecla empilhava uma entrada no historico e
    // sair da tela exigia um toque no Voltar por letra digitada.
    navigate({
      search: (atual) => ({ ...atual, search: valor || undefined, page: undefined }),
      replace: true,
    });
  };

  return (
    <GateShell>
      <div className="space-y-5">
        <CabecalhoPagina
          antes={
            <Button asChild variant="outline" size="icon" aria-label="Voltar para Categorias">
              <Link to="/categorias">
                <ArrowLeft />
              </Link>
            </Button>
          }
          titulo={categoria}
          frase={
            // O total só com a resposta: "0 perguntas" durante a espera diria
            // que o assunto está vazio.
            faqsQuery.data
              ? `${total} ${total === 1 ? "pergunta" : "perguntas"} neste assunto.`
              : "As perguntas deste assunto."
          }
          acoes={
            <InsertFaqButton
              label="Inserir pergunta"
              defaultCategory={categoria === "Sem categoria" ? undefined : categoria}
            />
          }
        />

        <SearchField
          value={termo}
          onChange={aplicarBusca}
          placeholder="Pesquisar neste assunto por pergunta ou tag…"
        />

        {faqsQuery.isError ? (
          <EstadoFalha onTentarDeNovo={() => faqsQuery.refetch()} tentando={faqsQuery.isFetching}>
            Não foi possível carregar as perguntas. Confira a internet e tente de novo.
          </EstadoFalha>
        ) : faqsQuery.isLoading && !faqsQuery.data ? (
          <Carregando texto="Carregando as perguntas deste assunto…" />
        ) : faqs.length === 0 ? (
          <EstadoVazio
            titulo={termo ? "Nenhuma pergunta com esta busca" : "Nenhuma pergunta neste assunto"}
          >
            {termo
              ? "Tente outra palavra."
              : "As perguntas cadastradas com este assunto aparecem aqui."}
          </EstadoVazio>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul aria-label={`Perguntas de ${categoria}`}>
              {faqs.map((faq) => (
                <FaqLinha key={faq.id} faq={faq} />
              ))}
            </ul>
            {totalPaginas > 1 && (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-[15px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span>
                  Página {page} de {totalPaginas}
                </span>
                <FaqPagination
                  page={page}
                  totalPages={totalPaginas}
                  onPageChange={(destino) =>
                    navigate({ search: (atual) => ({ ...atual, page: destino }) })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </GateShell>
  );
}
