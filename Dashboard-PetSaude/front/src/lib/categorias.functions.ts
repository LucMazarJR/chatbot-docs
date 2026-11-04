import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiFetch } from "./api.server";

export type Categoria = {
  id: string;
  nome: string;
  chave: string;
  descricao: string;
  ativa: boolean;
  criadaEm: string;
  criadaPor?: string;
  /** Quantas FAQs ativas usam este assunto, somando as variantes de grafia. */
  faqs: number;
};

export type ListaCategorias = {
  categorias: Categoria[];
  total: number;
  totalAtivas: number;
};

export type MotivoRevisao = "sem_categoria" | "variante" | "inativa" | "fora_da_lista";

export type GrupoRevisao = {
  /** O valor como está gravado nas FAQs. */
  categoria: string;
  motivo: MotivoRevisao;
  /** Para 'variante', a grafia oficial da lista. */
  sugestao?: string;
  quantidade: number;
  exemplos: { id: string; question: string }[];
};

export type Revisao = {
  resumo: { faqs: number; grupos: number; porMotivo: Record<MotivoRevisao, number> };
  grupos: GrupoRevisao[];
  /** Com a lista vazia, TODA FAQ cai em "fora_da_lista": verdade e inútil. */
  listaVazia: boolean;
};

export const listarCategorias = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ incluirInativas: z.boolean().default(false) }).parse(data ?? {}),
  )
  .handler(
    async ({ data }: { data: { incluirInativas: boolean } }): Promise<ListaCategorias> =>
      apiFetch<ListaCategorias>(`/categorias?incluirInativas=${data.incluirInativas}`),
  );

export const listarRevisaoCategorias = createServerFn({ method: "GET" }).handler(
  async (): Promise<Revisao> => apiFetch<Revisao>("/categorias/revisao"),
);

const entrada = z.object({
  nome: z.string().trim().min(2, "O nome precisa ter ao menos 2 caracteres").max(60),
  descricao: z.string().trim().max(300).optional(),
});

export const criarCategoria = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => entrada.parse(data))
  .handler(async ({ data }: { data: z.infer<typeof entrada> }): Promise<Categoria> =>
    apiFetch<Categoria>("/categorias", { method: "POST", body: JSON.stringify(data) }),
  );

export const atualizarCategoria = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().min(1),
        nome: z.string().trim().min(2).max(60).optional(),
        descricao: z.string().trim().max(300).optional(),
        ativa: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
    }: {
      data: { id: string; nome?: string; descricao?: string; ativa?: boolean };
    }): Promise<{ ok: true; renomeadas: number; reindexar: number }> => {
      const { id, ...corpo } = data;
      return apiFetch(`/categorias/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(corpo),
      });
    },
  );

/** Alinha as variantes de grafia ("exames", "EXAMES") ao nome oficial. */
export const normalizarCategoria = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(
    async ({
      data,
    }: {
      data: { id: string };
    }): Promise<{ ok: true; ajustadas: number; reindexar: number }> =>
      apiFetch(`/categorias/${encodeURIComponent(data.id)}/normalizar`, { method: "POST" }),
  );

export const excluirCategoria = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<{ ok: true }> =>
    apiFetch(`/categorias/${encodeURIComponent(data.id)}`, { method: "DELETE" }),
  );
