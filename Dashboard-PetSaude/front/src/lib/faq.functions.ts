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
  categories: z
    .array(z.string().trim().min(2, "Cada categoria precisa ter ao menos 2 caracteres").max(60))
    .min(1, "Informe ao menos 1 categoria"),
  tags: z
    .array(z.string().trim().min(2, "Cada tag precisa ter ao menos 2 caracteres").max(30))
    .min(3, "Informe ao menos 3 tags"),
  source: z.string().optional(),
});

const listFaqsQuery = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
});

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
  }
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
  .handler(async ({ data }: { data: { page: number; limit: number } }): Promise<Paginated<Activity>> => {
    return apiFetch<Paginated<Activity>>(`/activity?${montarQuery(data)}`);
  });

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
