import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";
import type { Paginated } from "./faq.functions";

export const TIPOS_ENTIDADE = ["faq", "usuario", "sessao", "regra_importacao", "sistema"] as const;

export type TipoEntidade = (typeof TIPOS_ENTIDADE)[number];

/**
 * O que cabe num campo do antes/depois.
 *
 * `unknown` seria mais honesto, mas as server functions do TanStack validam em
 * tempo de tipo que o retorno e serializavel, e `unknown` nao passa. Esta uniao
 * cobre o que o backend de fato grava: texto, numero, booleano e lista de tags.
 */
export type ValorAuditado = string | number | boolean | string[] | null;

export type RegistroAuditoria = {
  id: string;
  actor_name: string;
  actor_id: string | null;
  action: string;
  /** Descrição curta do alvo. O backend chama de `target`. */
  question: string;
  entity_type: TipoEntidade;
  entity_id: string | null;
  before: Record<string, ValorAuditado> | null;
  after: Record<string, ValorAuditado> | null;
  batch_id: string | null;
  status: "sucesso" | "negado";
  created_at: string;
};

export type Ator = { id: string | null; nome: string };

const filtro = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  actorId: z.string().max(64).optional(),
  entityType: z.enum(TIPOS_ENTIDADE).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(40).optional(),
  status: z.enum(["sucesso", "negado"]).optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
});

export type FiltroAuditoria = z.infer<typeof filtro>;

/** Monta a querystring omitindo o que está vazio. */
function montarQuery(params: Record<string, string | number | undefined>): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      busca.set(chave, String(valor));
    }
  }
  return busca.toString();
}

export const listarAuditoria = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => filtro.parse(data ?? {}))
  .handler(async ({ data }: { data: FiltroAuditoria }): Promise<Paginated<RegistroAuditoria>> =>
    apiFetch<Paginated<RegistroAuditoria>>(`/activity?${montarQuery(data)}`),
  );

/** Quem aparece no histórico, para o filtro por pessoa. */
export const listarAtores = createServerFn({ method: "GET" }).handler(async (): Promise<Ator[]> =>
  apiFetch<Ator[]>("/activity/atores"),
);
