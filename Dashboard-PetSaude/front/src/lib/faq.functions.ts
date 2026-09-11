import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiFetch } from "./api.server";

export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  categories: string[];
  tags: string[];
  created_by: string | null;
  updated_by: string | null;
  updatedAt: string;
  source?: string;
};

/** Envelope devolvido pelos endpoints paginados do backend. */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
};

export type CategoryStats = {
  categories: { category: string; count: number }[];
  totalFaqs: number;
  totalCategories: number;
};

/** Pedido ao backend quando o usuário quer as FAQs sem categoria. */
export const SEM_CATEGORIA = "__sem_categoria__";

export type Activity = {
  id: string;
  actor_name: string;
  action: string;
  question: string | null;
  created_at: string;
};

const faqInput = z.object({
  question: z.string().trim().min(5, "A pergunta precisa ter ao menos 5 caracteres").max(300),
  answer: z.string().trim().min(5, "A resposta precisa ter ao menos 5 caracteres").max(4000),
  // LÓGICA DO LUCIANO: era um array, e isso era mentira. O formulário deixava
  // acrescentar quantas categorias quisesse, mas o backend só gravava a
  // primeira (`data.categories[0]`) — as outras eram digitadas, salvas com
  // sucesso e descartadas em silêncio. O documento no Mongo tem UM campo
  // `category`, que é o que a ingestão Python e o nó do n8n leem, e é ele que
  // entra no texto embedado como "Assunto: ...".
  category: z.string().trim().min(2, "Escolha uma categoria").max(60),
  tags: z
    .array(z.string().trim().min(2, "Cada tag precisa ter ao menos 2 caracteres").max(30))
    .min(3, "Informe ao menos 3 tags"),
  source: z.string().optional(),
});

export const ORIGENS = ["manual", "importada", "drive"] as const;
export const SITUACOES = ["ativas", "inativas", "todas"] as const;

export type Origem = (typeof ORIGENS)[number];
export type Situacao = (typeof SITUACOES)[number];

const listFaqsQuery = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
  /** Casa com quem criou ou com quem alterou por último. */
  autor: z.string().trim().max(120).optional(),
  origem: z.enum(ORIGENS).optional(),
  situacao: z.enum(SITUACOES).optional(),
  de: z.string().trim().optional(),
  ate: z.string().trim().optional(),
});

export type FiltroFaqs = z.infer<typeof listFaqsQuery>;

/** Monta a querystring omitindo valores vazios: `?search=` casaria com tudo. */
function montarQuery(params: Record<string, string | number | undefined>): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      busca.set(chave, String(valor));
    }
  }
  return busca.toString();
}

/**
 * Uma FAQ pelo id.
 *
 * Existe para a tela de conversas: cada resposta do chatbot registra o id das
 * perguntas que a geraram, e quem revisa precisa ir do trecho ruim ao
 * documento. Buscar pelo texto não serve — há 180 FAQs com a pergunta "Como me
 * preparar para o Exame?", distinguidas só pelo assunto.
 */
export const getFaq = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<Faq> =>
    apiFetch<Faq>(`/faqs/${encodeURIComponent(data.id)}`),
  );

export const listFaqs = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => listFaqsQuery.parse(data ?? {}))
  .handler(async ({ data }: { data: z.infer<typeof listFaqsQuery> }): Promise<Paginated<Faq>> => {
    return apiFetch<Paginated<Faq>>(`/faqs?${montarQuery(data)}`);
  });

/**
 * Contagens por categoria. Substitui o agrupamento que as páginas faziam
 * baixando a coleção inteira — com 2451 FAQs, só para exibir ~18 números.
 */
export const getFaqCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryStats> => {
    return apiFetch<CategoryStats>("/faqs/categories");
  },
);

export const listActivity = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(15),
      })
      .parse(data ?? {}),
  )
  .handler(
    async ({ data }: { data: { page: number; limit: number } }): Promise<Paginated<Activity>> => {
      return apiFetch<Paginated<Activity>>(`/activity?${montarQuery(data)}`);
    },
  );

export type TrechoEncontrado = {
  id: string;
  question: string;
  category: string | null;
  score: number;
  /** Se o chatbot usaria este trecho como contexto. */
  passaria: boolean;
  /** FAQ desativada que mesmo assim voltou na busca. */
  ativa: boolean;
  previa: string;
};

export type ResultadoBusca = {
  pergunta: string;
  limiar: number;
  modelo: string;
  quantosPassam: number;
  trechos: TrechoEncontrado[];
};

/**
 * Roda a mesma busca do chatbot para uma pergunta digitada.
 *
 * Custa um embedding por chamada, na mesma cota diária que a ingestão e o
 * chatbot dividem — por isso não dispara enquanto se digita.
 */
export const testarBusca = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        pergunta: z.string().trim().min(2, "Escreva a pergunta").max(300),
        topK: z.number().int().min(1).max(25).optional(),
      })
      .parse(data),
  )
  .handler(
    async ({ data }: { data: { pergunta: string; topK?: number } }): Promise<ResultadoBusca> =>
      apiFetch<ResultadoBusca>("/faqs/testar-busca", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  );

export const createFaq = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqInput.parse(data))
  .handler(async ({ data }: { data: any }) => {
    return apiFetch<{ ok?: boolean }>("/faqs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  });

export const updateFaq = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqInput.extend({ id: z.string() }).parse(data))
  .handler(async ({ data }: { data: any }) => {
    return apiFetch<{ ok?: boolean }>("/faqs", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }: { data: any }) => {
    return apiFetch<{ ok?: boolean }>("/faqs", {
      method: "DELETE",
      body: JSON.stringify(data),
    });
  });
