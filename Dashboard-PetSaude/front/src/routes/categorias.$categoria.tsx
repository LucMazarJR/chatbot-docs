import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { listFaqs, SEM_CATEGORIA } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import { FaqPagination } from "@/components/faq-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { FaqCard, InsertFaqButton, SearchField } from "@/components/faq-shared";
import { exigirSessao } from "@/lib/guardas";

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
    navigate({ search: (atual) => ({ ...atual, search: valor, page: 1 }) });
  };

  return (
    <GateShell>
      <div className="space-y-6">
        <Link
          to="/categorias"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Todas as categorias
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{categoria}</h2>
            <p className="text-sm text-muted-foreground">
              {total} {total === 1 ? "pergunta" : "perguntas"}
              {totalPaginas > 1 ? ` · página ${page} de ${totalPaginas}` : ""}
            </p>
          </div>
          <InsertFaqButton
            defaultCategory={categoria === "Sem categoria" ? undefined : categoria}
          />
        </div>

        <SearchField
          value={termo}
          onChange={aplicarBusca}
          placeholder="Pesquisar nesta categoria por pergunta ou tag…"
        />

        {faqsQuery.isLoading && !faqsQuery.data ? (
          <p className="text-sm text-muted-foreground">Carregando perguntas…</p>
        ) : faqs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma pergunta nesta categoria.
          </p>
        ) : (
          <ul className="space-y-3">
            {faqs.map((faq) => (
              <FaqCard key={faq.id} faq={faq} />
            ))}
          </ul>
        )}

        <FaqPagination
          page={page}
          totalPages={totalPaginas}
          onPageChange={(destino) => navigate({ search: (atual) => ({ ...atual, page: destino }) })}
        />
      </div>
    </GateShell>
  );
}