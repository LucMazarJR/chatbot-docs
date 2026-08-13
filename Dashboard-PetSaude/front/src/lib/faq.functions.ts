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
  updated_at: string;
  source?: string;
  deleted_at?: string;
};

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

export const listFaqs = createServerFn({ method: "GET" }).handler(async (): Promise<Faq[]> => {
  const rs = await fetch(`${API_BASE}/faqs`);
  return rs.json();
});

export const listActivity = createServerFn({ method: "GET" }).handler(
  async (): Promise<Activity[]> => {
    const rs = await fetch(`${API_BASE}/activity`);
    return rs.json();
  }
);

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
