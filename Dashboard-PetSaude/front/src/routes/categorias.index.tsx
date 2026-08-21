import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { getFaqCategories } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import { InsertFaqButton } from "@/components/faq-shared";
import { exigirSessao } from "@/lib/guardas";

export const Route = createFileRoute("/categorias/")({
  beforeLoad: () => exigirSessao(),
  head: () => ({
    meta: [
      { title: "Categorias de FAQs | Central de FAQs" },
      {
        name: "description",
        content:
          "Veja todas as categorias de perguntas frequentes em saúde e quantas perguntas cada uma possui.",
      },
      { property: "og:title", content: "Categorias de FAQs" },
      {
        property: "og:description",
        content: "Navegue pelas categorias e abra as perguntas frequentes de cada tema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  // Esta página só precisa de ~18 números. Antes ela baixava as 2451 FAQs
  // inteiras, com embeddings já removidos mas ainda assim a coleção completa,
  // para contá-las no navegador.
  const categoriasQuery = useQuery({
    queryKey: ["faq-categories"],
    queryFn: () => getFaqCategories(),
  });

  const categories = categoriasQuery.data?.categories ?? [];

  return (
    <GateShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Categorias</h2>
            <p className="text-sm text-muted-foreground">
              {categories.length} {categories.length === 1 ? "categoria" : "categorias"} cadastradas
            </p>
          </div>
          <InsertFaqButton />
        </div>

        {categoriasQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando categorias…</p>
        ) : categories.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma categoria cadastrada.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {categories.map(({ category, count }) => (
              <li key={category}>
                <Link
                  to="/categorias/$categoria"
                  params={{ categoria: category }}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border panel-surface p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <span>
                    <span className="block text-base font-semibold">{category}</span>
                    <span className="text-xs text-muted-foreground">
                      {count} {count === 1 ? "pergunta" : "perguntas"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GateShell>
  );
}