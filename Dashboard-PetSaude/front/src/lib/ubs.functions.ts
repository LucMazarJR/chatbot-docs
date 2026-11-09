import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiFetch } from "./api.server";

export type PeriodoUbs = "hoje" | "7d" | "30d" | "tudo";
export type ComoIdentificou = "nome" | "corrigida" | "aproximada";

export type LinhaUbs = {
  id: string;
  nome: string;
  conversas: number;
  perguntas: number;
  /** Sobre as conversas com UBS reconhecida. */
  percentual: number;
};

export type Grafia = {
  chave: string;
  /** O jeito mais comum de escrever este texto. */
  texto: string;
  vezes: number;
  ubsId: string | null;
  ubsNome: string | null;
  /** Nulo quando o sistema não soube dizer qual é a unidade. */
  como: ComoIdentificou | null;
};

export type PainelUbs = {
  conversas: number;
  identificadas: number;
  paraRevisar: number;
  naoInformaram: number;
  anteriores: number;
  porUbs: LinhaUbs[];
  grafias: Grafia[];
};

export const obterPainelUbs = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ periodo: z.enum(["hoje", "7d", "30d", "tudo"]).default("tudo") }).parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<PainelUbs> =>
    apiFetch<PainelUbs>(`/ubs/painel?periodo=${data.periodo}`),
  );

const nome = z.string().trim().min(2, "O nome precisa ter ao menos 2 letras").max(60);

export const criarUbs = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ nome }).parse(data))
  .handler(async ({ data }) =>
    apiFetch<{ id: string }>("/ubs", { method: "POST", body: JSON.stringify(data) }),
  );

export const renomearUbs = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1), nome }).parse(data))
  .handler(async ({ data }) =>
    apiFetch<{ id: string }>(`/ubs/${encodeURIComponent(data.id)}`, {
      method: "PUT",
      body: JSON.stringify({ nome: data.nome }),
    }),
  );

export const removerUbs = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) =>
    apiFetch<{ ok: boolean }>(`/ubs/${encodeURIComponent(data.id)}`, { method: "DELETE" }),
  );

export const corrigirGrafia = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ chave: z.string().min(1), ubsId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) =>
    apiFetch<{ ok: boolean }>("/ubs/grafias/corrigir", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );

export const descartarGrafia = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ chave: z.string().min(1) }).parse(data))
  .handler(async ({ data }) =>
    apiFetch<{ ok: boolean }>("/ubs/grafias/descartar", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );
