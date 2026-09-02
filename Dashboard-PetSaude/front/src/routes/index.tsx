import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FolderOpen } from "lucide-react";

import { getFaqCategories, listFaqs, SEM_CATEGORIA } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import { FaqPagination } from "@/components/faq-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FaqCard, InsertFaqButton, SearchField } from "@/components/faq-shared";
import { exigirSessao } from "@/lib/guardas";

const POR_PAGINA = 20;
const TODAS = "__todas__";

// Campos opcionais de proposito: com eles obrigatorios, todo <Link to="/">
// no app passaria a exigir a querystring completa.
type Busca = { page?: number; search?: string; category?: string };

export const Route = createFileRoute("/")({
  // Página, busca e categoria moram na URL: sobrevivem ao refresh e ao botão
  // voltar, e tornam o link compartilhável.
  beforeLoad: () => exigirSessao(),
  validateSearch: (search: Record<string, unknown>): Busca => {
    const page = Number(search.page ?? 1) || 1;
    const termo = typeof search.search === "string" ? search.search : "";
    const categoria = typeof search.category === "string" ? search.category : "";

    // Só devolve o que difere do padrão. Devolvendo sempre os três, o roteador
    // considera a URL "não canônica" e responde 307 para
    // `/?page=1&search=&category=` — um redirect em toda visita à home, e a
    // barra de endereços poluída de parâmetros vazios.
    return {
      ...(page > 1 ? { page } : {}),
      ...(termo ? { search: termo } : {}),
      ...(categoria ? { category: categoria } : {}),
    };
  },
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
  const { page = 1, search = "", category = "" } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [termo, setTermo] = useState(search);
  const termoAtrasado = useDebouncedValue(termo, 300);

  const faqsQuery = useQuery({
    queryKey: ["faqs", { page, search: termoAtrasado, category }],
    queryFn: () => listFaqs({ data: { page, limit: POR_PAGINA, search: termoAtrasado, category } }),
    placeholderData: keepPreviousData,
  });

  // Os totais do cabeçalho vêm da agregação, não da página atual: usar o total
  // filtrado faria o número dançar a cada tecla digitada.
  const categoriasQuery = useQuery({
    queryKey: ["faq-categories"],
    queryFn: () => getFaqCategories(),
  });

  const faqs = faqsQuery.data?.items ?? [];
  const totalFiltrado = faqsQuery.data?.total ?? 0;
  const totalPaginas = faqsQuery.data?.totalPages ?? 1;
  const categorias = categoriasQuery.data?.categories ?? [];

  // Trocar filtro sempre volta para a primeira página: sem isso, filtrar
  // estando na página 8 mostra "nenhuma pergunta encontrada" num resultado que
  // tem 2 páginas.
  const aplicarBusca = (valor: string) => {
    setTermo(valor);
    navigate({ search: (atual) => ({ ...atual, search: valor, page: 1 }) });
  };

  const aplicarCategoria = (valor: string) => {
    const escolhida = valor === TODAS ? "" : valor;
    navigate({ search: (atual) => ({ ...atual, category: escolhida, page: 1 }) });
  };

  const irParaPagina = (destino: number) => {
    navigate({ search: (atual) => ({ ...atual, page: destino }) });
  };

  if (faqsQuery.isLoading && !faqsQuery.data)
    return <p className="text-sm text-muted-foreground">Carregando perguntas…</p>;

  return (
    <div className="space-y-6">
      <div>
        {/* text-5xl fixo passava de metade da altura util em 360px. */}
        <p className="text-4xl font-semibold text-primary sm:text-5xl">
          {categoriasQuery.data?.totalFaqs ?? "—"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">FAQs cadastradas</p>
      </div>

      {/* A busca ocupa a linha inteira ate lg; filtro e acoes ficam numa segunda
          linha que quebra sozinha. Antes eram quatro filhos disputando um
          sm:flex-row, e a partir de 640px a busca encolhia ate caber tres
          palavras. */}
      <div className="space-y-3 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
        <div className="lg:flex-1">
          <SearchField
            value={termo}
            onChange={aplicarBusca}
            placeholder="Pesquisar por pergunta, categoria ou tag…"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={category || TODAS} onValueChange={aplicarCategoria}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem
                  key={c.category}
                  value={c.category === "Sem categoria" ? SEM_CATEGORIA : c.category}
                >
                  {c.category} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link to="/categorias">
              <FolderOpen className="size-4" /> Categorias (
              {categoriasQuery.data?.totalCategories ?? 0})
            </Link>
          </Button>
          <InsertFaqButton />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {totalFiltrado} {totalFiltrado === 1 ? "resultado" : "resultados"}
        {totalPaginas > 1 ? ` · página ${page} de ${totalPaginas}` : ""}
      </p>

      {faqs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 sm:p-8 text-center text-sm text-muted-foreground">
          Nenhuma pergunta encontrada.
        </p>
      ) : (
        <ul className="space-y-3">
          {faqs.map((faq) => (
            <FaqCard key={faq.id} faq={faq} />
          ))}
        </ul>
      )}

      <FaqPagination page={page} totalPages={totalPaginas} onPageChange={irParaPagina} />
    </div>
  );
}
