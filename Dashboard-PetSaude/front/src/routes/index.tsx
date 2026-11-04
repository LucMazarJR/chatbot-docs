import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, FolderOpen, UserRound } from "lucide-react";

import {
  getFaqCategories,
  listFaqs,
  ORIGENS,
  SITUACOES,
  type Origem,
  type Situacao,
} from "@/lib/faq.functions";
import { GateShell, usePodeEscrever } from "@/components/gate";
import { FaqPagination } from "@/components/faq-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { FaqLinha, InsertFaqButton, SearchField } from "@/components/faq-shared";
import { TesteDeBusca } from "@/components/teste-busca";
import {
  BotaoFiltros,
  FILTRO_VAZIO,
  PainelFiltros,
  SeletorAssunto,
  contarFiltrosAtivos,
  contarOutrosFiltros,
  fimDoDia,
  inicioDoDia,
  type ValoresFiltro,
} from "@/components/filtros-faq";
import { exigirSessao } from "@/lib/guardas";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";

const POR_PAGINA = 20;

// Campos opcionais de proposito: com eles obrigatorios, todo <Link to="/">
// no app passaria a exigir a querystring completa.
type Busca = {
  page?: number;
  search?: string;
  category?: string;
  tag?: string;
  autor?: string;
  /** "Minhas perguntas": só as que a conta logada criou ou alterou. */
  minhas?: "sim";
  origem?: Origem;
  situacao?: Situacao;
  de?: string;
  ate?: string;
};

const texto = (valor: unknown) => (typeof valor === "string" && valor ? valor : "");

/**
 * LÓGICA DO LUCIANO: valida em vez de só converter com `as`.
 *
 * O `validateSearch` aceitava qualquer texto e o repassava como se fosse um
 * valor válido. Um `?origem=xyz` na URL, de um link velho ou de alguém mexendo
 * na barra de endereços, passava daqui e ia estourar no `z.enum` da server
 * function: a listagem inteira caía no painel de erro por causa de um parâmetro
 * de filtro. Valor desconhecido agora é simplesmente ignorado.
 */
const umDe = <T extends string>(opcoes: readonly T[], valor: unknown): T | "" => {
  const t = texto(valor);
  return (opcoes as readonly string[]).includes(t) ? (t as T) : "";
};

export const Route = createFileRoute("/")({
  // Página, busca e filtros moram na URL: sobrevivem ao refresh e ao botão
  // voltar, e tornam o link compartilhável.
  beforeLoad: () => exigirSessao(),
  validateSearch: (search: Record<string, unknown>): Busca => {
    const page = Number(search.page ?? 1) || 1;
    const origem = umDe(ORIGENS, search.origem);
    const situacao = umDe(SITUACOES, search.situacao);

    // Só devolve o que difere do padrão. Devolvendo sempre tudo, o roteador
    // considera a URL "não canônica" e responde 307 para a versão com os
    // parâmetros vazios: um redirect em toda visita à home.
    return {
      ...(page > 1 ? { page } : {}),
      ...(texto(search.search) ? { search: texto(search.search) } : {}),
      ...(texto(search.category) ? { category: texto(search.category) } : {}),
      ...(texto(search.tag) ? { tag: texto(search.tag) } : {}),
      ...(texto(search.autor) ? { autor: texto(search.autor) } : {}),
      ...(search.minhas === "sim" ? { minhas: "sim" as const } : {}),
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
  const [testeAberto, setTesteAberto] = useState(false);
  const podeEscrever = usePodeEscrever();

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
          ...(busca.minhas ? { minhas: "sim" as const } : {}),
          ...(valores.origem ? { origem: valores.origem } : {}),
          ...(valores.situacao ? { situacao: valores.situacao } : {}),
          // O navegador monta as pontas do dia no fuso de quem esta filtrando:
          // o servidor roda em UTC e nao tem como deduzir isso da data solta.
          ...(inicioDoDia(valores.de) ? { de: inicioDoDia(valores.de) } : {}),
          ...(fimDoDia(valores.ate) ? { ate: fimDoDia(valores.ate) } : {}),
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
  const soMinhas = busca.minhas === "sim";
  const temFiltro = contarFiltrosAtivos(valores) > 0 || Boolean(termo) || soMinhas;

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

  const primeiro = (page - 1) * POR_PAGINA + 1;
  const ultimo = Math.min(page * POR_PAGINA, totalFiltrado);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Perguntas frequentes"
        frase={
          // O total só aparece com a resposta na mão: um "0 perguntas"
          // provisório diria que a base está vazia.
          categoriasQuery.data
            ? `${categoriasQuery.data.totalFaqs.toLocaleString("pt-BR")} perguntas em ${categoriasQuery.data.totalCategories} assuntos, lidas pelo chatbot para responder.`
            : "As perguntas que o chatbot lê para responder."
        }
        acoes={
          <>
            <Button asChild variant="outline">
              <Link to="/categorias">
                <FolderOpen /> Assuntos
              </Link>
            </Button>
            <InsertFaqButton label="Inserir pergunta" />
          </>
        }
      />

      {/* Busca, assunto, filtros e o teste de busca numa barra só: antes eram
          três blocos empilhados, e a lista começava abaixo da dobra. */}
      <section
        aria-label="Buscar e filtrar"
        className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <SearchField
          value={termo}
          onChange={aplicarBusca}
          placeholder="Pesquisar por pergunta, resposta ou tag…"
          className="min-w-0 sm:min-w-64 sm:flex-1"
          inputClassName="bg-background"
        />
        <SeletorAssunto
          valor={valores.category}
          aoMudar={(category) => aplicarFiltro({ category })}
          categorias={categorias}
        />
        <div className="flex flex-wrap gap-2.5">
          {/* Atalho pedido pela equipe: achar as próprias perguntas sem digitar
              o nome. O back usa o nome da sessão e casa com ele inteiro. */}
          <Button
            type="button"
            variant={soMinhas ? "secondary" : "outline"}
            aria-pressed={soMinhas}
            onClick={() =>
              navigate({
                search: (atual) => ({
                  ...atual,
                  minhas: soMinhas ? undefined : "sim",
                  page: undefined,
                }),
                replace: true,
              })
            }
            className={soMinhas ? "border border-primary" : undefined}
          >
            <UserRound /> Minhas perguntas
          </Button>
          <BotaoFiltros
            aberto={filtrosAbertos}
            aoAlternar={() => setFiltrosAbertos((v) => !v)}
            ativos={contarOutrosFiltros(valores)}
          />
          {/* A busca por palavra acha o texto digitado; esta mostra o que o
              chatbot acharia por significado. Leitor não tem o que corrigir
              com o resultado, e cada teste gasta cota. */}
          {podeEscrever && (
            <Button
              type="button"
              variant="outline"
              aria-expanded={testeAberto}
              aria-controls="teste-de-busca"
              onClick={() => setTesteAberto((v) => !v)}
            >
              <FlaskConical /> Testar busca do chatbot
            </Button>
          )}
        </div>
      </section>

      {filtrosAbertos && (
        <PainelFiltros
          valores={valores}
          aoMudar={aplicarFiltro}
          aoLimpar={() => aplicarFiltro({ ...FILTRO_VAZIO, category: valores.category })}
        />
      )}

      {testeAberto && <TesteDeBusca aoFechar={() => setTesteAberto(false)} />}

      {faqsQuery.isError ? (
        // Um erro de rede nunca vira "nenhuma pergunta encontrada": seria o
        // painel afirmando que a base está vazia quando ele só caiu.
        <EstadoFalha onTentarDeNovo={() => faqsQuery.refetch()} tentando={faqsQuery.isFetching}>
          Não foi possível carregar as perguntas. Confira a internet e tente de novo.
          {faqsQuery.error instanceof Error && faqsQuery.error.message && (
            // A mensagem do servidor ajuda a separar conexão caída de consulta
            // que passou do tempo.
            <span className="mt-1 block text-xs font-normal opacity-80">
              {faqsQuery.error.message}
            </span>
          )}
        </EstadoFalha>
      ) : faqsQuery.isLoading && !faqsQuery.data ? (
        <Carregando texto="Carregando as perguntas…" />
      ) : faqs.length === 0 ? (
        soMinhas && contarFiltrosAtivos(valores) === 0 && !termo ? (
          <EstadoVazio
            titulo="Você ainda não cadastrou nem alterou nenhuma pergunta"
            acao={
              <Button type="button" variant="outline" onClick={limparTudo}>
                Ver todas as perguntas
              </Button>
            }
          >
            As perguntas que você criar ou editar aparecem aqui.
          </EstadoVazio>
        ) : (
          <EstadoVazio
            titulo={temFiltro ? "Nenhuma pergunta com esta busca" : "Nenhuma pergunta cadastrada"}
            acao={
              temFiltro ? (
                <Button type="button" variant="outline" onClick={limparTudo}>
                  Limpar a busca e os filtros
                </Button>
              ) : (
                <InsertFaqButton label="Cadastrar a primeira" />
              )
            }
          >
            {temFiltro
              ? "Tente outra palavra, ou tire um filtro."
              : "As perguntas cadastradas aqui passam a ser usadas pelo chatbot."}
          </EstadoVazio>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_190px_120px_96px] gap-5 border-b border-border px-5 py-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground md:grid"
          >
            <span>Pergunta</span>
            <span>Assunto</span>
            <span>Atualizada</span>
            <span />
          </div>
          <ul aria-label="Perguntas" aria-busy={faqsQuery.isFetching}>
            {faqs.map((faq) => (
              <FaqLinha key={faq.id} faq={faq} />
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-[15px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span aria-live="polite">
              Mostrando {primeiro} a {ultimo} de {totalFiltrado.toLocaleString("pt-BR")}
            </span>
            <FaqPagination
              page={page}
              totalPages={totalPaginas}
              onPageChange={(destino) =>
                navigate({ search: (atual) => ({ ...atual, page: destino }) })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
