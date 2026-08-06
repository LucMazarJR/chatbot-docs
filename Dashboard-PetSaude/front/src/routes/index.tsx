import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";

import { listFaqs, type Faq } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import { Button } from "@/components/ui/button";
import {
  FaqCard,
  InsertFaqButton,
  SearchField,
  faqCategories,
  useSearchableFaqs,
} from "@/components/faq-shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Central de FAQs | Perguntas frequentes em saúde" },
      {
        name: "description",
        content:
          "Painel clínico protegido por senha para consultar, inserir, editar e excluir perguntas frequentes sobre saúde por categoria e tags.",
      },
      { property: "og:title", content: "Central de FAQs" },
      {
        property: "og:description",
        content:
          "Consulte por categoria, pesquise por tags e gerencie as perguntas frequentes da sua equipe de saúde.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <GateShell>
      <div className="space-y-6">
        <BrowsePanel />
      </div>
    </GateShell>
  );
}

function BrowsePanel() {
  const faqsQuery = useQuery({ queryKey: ["faqs"], queryFn: () => listFaqs() });
  const faqs = faqsQuery.data ?? [];
  const [term, setTerm] = useState("");
  const filtered = useSearchableFaqs(faqs, term);

  const groups = useMemo(() => {
    const map = new Map<string, Faq[]>();
    for (const faq of filtered) {
      const categories = faqCategories(faq);
      const keys = categories.length ? categories : ["Sem categoria"];
      for (const key of keys) map.set(key, [...(map.get(key) ?? []), faq]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [filtered]);

  const categoryCount = useMemo(() => {
    const set = new Set<string>();
    for (const faq of faqs) {
      const categories = faqCategories(faq);
      if (categories.length === 0) set.add("Sem categoria");
      for (const category of categories) set.add(category);
    }
    return set.size;
  }, [faqs]);

  if (faqsQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando perguntas…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-5xl font-semibold text-primary">{faqs.length}</p>
        <p className="mt-1 text-sm text-muted-foreground">FAQs cadastradas</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchField
            value={term}
            onChange={setTerm}
            placeholder="Pesquisar por pergunta, categoria ou tag…"
          />
        </div>
        <Button asChild variant="outline">
          <Link to="/categorias">
            <FolderOpen className="size-4" /> Categorias ({categoryCount})
          </Link>
        </Button>
        <InsertFaqButton />
      </div>


      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma pergunta encontrada.
        </p>
      ) : (
        groups.map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h2 className="flex items-baseline gap-2 text-base font-semibold">
              {category}
              <span className="text-xs font-normal text-muted-foreground">
                {items.length} {items.length === 1 ? "pergunta" : "perguntas"}
              </span>
            </h2>
            <ul className="space-y-3">
              {items.map((faq) => (
                <FaqCard key={faq.id} faq={faq} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
