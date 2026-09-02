import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FolderOpen } from "lucide-react";

import { getFaqCategories, listFaqs, type Origem, type Situacao } from "@/lib/faq.functions";
import { GateShell } from "@/components/gate";
import { FaqPagination } from "@/components/faq-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { FaqCard, InsertFaqButton, SearchField } from "@/components/faq-shared";
import {
  FILTRO_VAZIO,
  FiltrosFaq,
  contarFiltrosAtivos,
  type ValoresFiltro,
} from "@/components/filtros-faq";
import { exigirSessao } from "@/lib/guardas";

const POR_PAGINA = 20;

// Campos opcionais de proposito: com eles obrigatorios, todo <Link to="/">
// no app passaria a exigir a querystring completa.
type Busca = {
  page?: number;
  search?: string;
  category?: string;
  tag?: string;
  autor?: string;
  origem?: Origem;
  situacao?: Situacao;
  de?: string;
  ate?: string;
};

const texto = (valor: unknown) => (typeof valor === "string" && valor ? valor : "");

export const Route = createFileRoute("/")({
  // Página, busca e filtros moram na URL: sobrevivem ao refresh e ao botão
  // voltar, e tornam o link compartilhável.
  beforeLoad: () => exigirSessao(),
  validateSearch: (search: Record<string, unknown>): Busca => {
    const page = Number(search.page ?? 1) || 1;
    const origem = texto(search.origem) as Origem | "";
    const situacao = texto(search.situacao) as Situacao | "";

    // Só devolve o que difere do padrão. Devolvendo sempre tudo, o roteador
    // considera a URL "não canônica" e responde 307 para a versão com os
    // parâmetros vazios: um redirect em toda visita à home.
    return {
      ...(page > 1 ? { page } : {}),
      ...(texto(search.search) ? { search: texto(search.search) } : {}),
      ...(texto(search.category) ? { category: texto(search.category) } : {}),
      ...(texto(search.tag) ? { tag: texto(search.tag) } : {}),
      ...(texto(search.autor) ? { autor: texto(search.autor) } : {}),
      ...(origem ? { origem } : {}),
      ...(situacao ? { situacao } : {}),
      ...(texto(search.de) ? { de: texto(search.de) } : {}),
      ...(texto(search.ate) ? { ate: texto(search.ate) } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Central de FAQs | Perguntas frequentes em saúde" },
      {
        name: "description",
        content:
          "Painel para consultar, inserir, editar e excluir perguntas frequentes sobre saúde por assunto e tags.",
      },
      { property: "og:title", content: "Central de FAQs" },
      {
        property: "og:description",
        content: "Consulte por assunto, pesquise por tags e gerencie as perguntas da sua equipe.",
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
      <BrowsePanel />
    </GateShell>
  );
}

function BrowsePanel() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { page = 1, search = "" } = busca;

  const [termo, setTermo] = useState(search);
  const termoAtrasado = useDebouncedValue(termo, 300);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const valores: ValoresFiltro = {
    category: busca.category ?? "",
    tag: busca.tag ?? "",
    autor: busca.autor ?? "",
    origem: busca.origem ?? "",
    situacao: busca.situacao ?? "",
    de: busca.de ?? "",
    ate: busca.ate ?? "",
  };

  const faqsQuery = useQuery({
    queryKey: ["faqs", { ...busca, search: termoAtrasado, page }],
    queryFn: () =>
      listFaqs({
        data: {
          page,
          limit: POR_PAGINA,
          search: termoAtrasado,
          ...(valores.category ? { category: valores.category } : {}),
          ...(valores.tag ? { tag: valores.tag } : {}),
          ...(valores.autor ? { autor: valores.autor } : {}),
          ...(valores.origem ? { origem: valores.origem } : {}),
          ...(valores.situacao ? { situacao: valores.situacao } : {}),
          ...(valores.de ? { de: valores.de } : {}),
          ...(valores.ate ? { ate: valores.ate } : {}),
        },
      }),
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
  const temFiltro = contarFiltrosAtivos(valores) > 0 || Boolean(termo);

  /**
   * LÓGICA DO LUCIANO: `replace: true` na busca. Sem ele, cada tecla digitada
   * empilhava uma entrada no histórico do navegador: escrever "vacina" exigia
   * seis toques no botão Voltar para sair da tela. No celular essa é a queixa
   * mais provável do app inteiro. O debounce atrasava só a consulta, não a
   * navegação.
   */
  const aplicarBusca = (valor: string) => {
    setTermo(valor);
    navigate({
      search: (atual) => ({ ...atual, search: valor || undefined, page: undefined }),
      replace: true,
    });
  };

  // Trocar filtro sempre volta para a primeira página: sem isso, filtrar
  // estando na página 8 mostra "nenhuma pergunta encontrada" num resultado que
  // tem 2 páginas.
  const aplicarFiltro = (parcial: Partial<ValoresFiltro>) => {
    navigate({
      search: (atual) => {
        const proximo: Record<string, unknown> = { ...atual, ...parcial, page: undefined };
        // Valor vazio sai da URL em vez de virar `?tag=`.
        for (const chave of Object.keys(parcial)) {
          if (!proximo[chave]) delete proximo[chave];
        }
        return proximo as Busca;
      },
      replace: true,
    });
  };

  const limparTudo = () => {
    setTermo("");
    navigate({ search: {}, replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Perguntas frequentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {categoriasQuery.data
              ? `${categoriasQuery.data.totalFaqs} cadastradas em ${categoriasQuery.data.totalCategories} assuntos`
              : "Carregando…"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/categorias">
              <FolderOpen className="size-4" /> Assuntos
            </Link>
          </Button>
          <InsertFaqButton />
        </div>
      </div>

      <SearchField
        value={termo}
        onChange={aplicarBusca}
        placeholder="Pesquisar por pergunta, assunto ou tag…"
      />

      <FiltrosFaq
        aberto={filtrosAbertos}
        aoAlternar={() => setFiltrosAbertos((v) => !v)}
        valores={valores}
        aoMudar={aplicarFiltro}
        aoLimpar={() => aplicarFiltro(FILTRO_VAZIO)}
        categorias={categorias}
      />

      <p className="text-sm text-muted-foreground">
        {totalFiltrado} {totalFiltrado === 1 ? "resultado" : "resultados"}
        {totalPaginas > 1 ? ` · página ${page} de ${totalPaginas}` : ""}
      </p>

      {faqsQuery.isError ? (
        // Antes, um erro de rede caía no ramo de lista vazia e a tela dizia
        // "0 resultados · nenhuma pergunta encontrada": o app afirmava que a
        // base estava vazia quando na verdade tinha caído.
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center sm:p-8">
          <p className="text-sm text-destructive">
            Não foi possível carregar as perguntas. Verifique a conexão e tente recarregar.
          </p>
          {/* A mensagem do servidor aparece aqui de propósito. Sem ela, uma
              falha intermitente vira "não funciona" e não há como distinguir
              conexão caída de consulta que passou do tempo. */}
          {faqsQuery.error instanceof Error && faqsQuery.error.message && (
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {faqsQuery.error.message}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => faqsQuery.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      ) : faqsQuery.isLoading && !faqsQuery.data ? (
        <p className="text-sm text-muted-foreground">Carregando perguntas…</p>
      ) : faqs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center sm:p-8">
          <p className="text-sm text-muted-foreground">
            {temFiltro
              ? "Nenhuma pergunta encontrada com esta busca."
              : "Nenhuma pergunta cadastrada ainda."}
          </p>
          {temFiltro ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={limparTudo}>
              Limpar a busca e os filtros
            </Button>
          ) : (
            <div className="mt-3 flex justify-center">
              <InsertFaqButton label="Cadastrar a primeira" />
            </div>
          )}
        </div>
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
  );
}
