import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gateSession } from "./faq-gate.server";

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

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3333";

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await gateSession();
  return {
    unlocked: session.data.unlocked ?? false,
    name: session.data.name ?? null
  };
});

export const unlockDashboard = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "Informe seu nome").max(60),
        password: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: any }) => {
    try {
      const rs = await fetch(`${API_BASE}/gate/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await rs.json();
      if (result.ok) {
        const session = await gateSession();
        await session.update({ unlocked: true, name: data.name });
      }
      return result;
    } catch (e) {
      console.error("[unlockDashboard Error]:", e);
      throw e;
    }
  });

export const lockDashboard = createServerFn({ method: "POST" }).handler(async () => {
  const session = await gateSession();
  await session.clear();
  return { ok: true };
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
    const rs = await fetch(`${API_BASE}/faqs?${montarQuery(data)}`);
    if (!rs.ok) throw new Error("Erro ao carregar as FAQs");
    return rs.json();
  });

/**
 * Contagens por categoria. Substitui o agrupamento que as páginas faziam
 * baixando a coleção inteira — com 2451 FAQs, só para exibir ~18 números.
 */
export const getFaqCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryStats> => {
    const rs = await fetch(`${API_BASE}/faqs/categories`);
    if (!rs.ok) throw new Error("Erro ao carregar as categorias");
    return rs.json();
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
    const rs = await fetch(`${API_BASE}/activity?${montarQuery(data)}`);
    if (!rs.ok) throw new Error("Erro ao carregar o histórico");
    return rs.json();
  });

export const createFaq = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqInput.parse(data))
  .handler(async ({ data }: { data: any }) => {
    const session = await gateSession();
    const actor = session.data.name || "";

    const rs = await fetch(`${API_BASE}/faqs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-actor-name": actor
      },
      body: JSON.stringify(data),
    });
    if (!rs.ok) throw new Error("Erro ao criar FAQ");
    return rs.json();
  });

export const updateFaq = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => faqInput.extend({ id: z.string() }).parse(data))
  .handler(async ({ data }: { data: any }) => {
    const session = await gateSession();
    const actor = session.data.name || "";

    const rs = await fetch(`${API_BASE}/faqs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-actor-name": actor
      },
      body: JSON.stringify(data),
    });
    if (!rs.ok) throw new Error("Erro ao editar FAQ");
    return rs.json();
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }: { data: any }) => {
    const session = await gateSession();
    const actor = session.data.name || "";

    const rs = await fetch(`${API_BASE}/faqs`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-actor-name": actor
      },
      body: JSON.stringify(data),
    });
    if (!rs.ok) throw new Error("Erro ao excluir FAQ");
    return rs.json();
  });
