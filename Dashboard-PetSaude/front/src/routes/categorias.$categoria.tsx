import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { listFaqs } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import {
  FaqCard,
  InsertFaqButton,
  SearchField,
  faqCategories,
  useSearchableFaqs,
} from "@/components/faq-shared";

export const Route = createFileRoute("/categorias/$categoria")({
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
  const faqsQuery = useQuery({ queryKey: ["faqs"], queryFn: () => listFaqs() });
  const [term, setTerm] = useState("");

  const inCategory = useMemo(() => {
    return (faqsQuery.data ?? []).filter((faq) => {
      const list = faqCategories(faq);
      if (categoria === "Sem categoria") return list.length === 0;
      return list.some((item) => item.toLowerCase() === categoria.toLowerCase());
    });
  }, [faqsQuery.data, categoria]);

  const filtered = useSearchableFaqs(inCategory, term);

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
              {inCategory.length} {inCategory.length === 1 ? "pergunta" : "perguntas"}
            </p>
          </div>
          <InsertFaqButton
            defaultCategory={categoria === "Sem categoria" ? undefined : categoria}
          />
        </div>

        <SearchField
          value={term}
          onChange={setTerm}
          placeholder="Pesquisar nesta categoria por pergunta ou tag…"
        />

        {faqsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando perguntas…</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma pergunta nesta categoria.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((faq) => (
              <FaqCard key={faq.id} faq={faq} />
            ))}
          </ul>
        )}
      </div>
    </GateShell>
  );
}
