import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";
import type { Job } from "./import.functions";

export type SaudeEmbeddings = {
  modeloConfigurado: string;
  dimensaoEsperada: number;
  totalAtivas: number;
  semVetor: number;
  dimensaoErrada: number;
  vetorDesatualizado: number;
  modeloDivergente: number;
  modeloNaoRegistrado: number;
};

export type Diagnostico = {
  modeloConfigurado: string;
  amostradas: number;
  similaridades: { question: string; similaridade: number }[];
  similaridadeMedia: number;
  veredito: "mesmo_modelo" | "modelo_diferente" | "inconclusivo";
  explicacao: string;
};

export const MODOS_BACKFILL = [
  "faltantes",
  "desatualizados",
  "nao_registrados",
  "divergentes",
  "tudo",
] as const;

export type ModoBackfill = (typeof MODOS_BACKFILL)[number];

const modo = z.enum(MODOS_BACKFILL);

export const getSaudeEmbeddings = createServerFn({ method: "GET" }).handler(
  async (): Promise<SaudeEmbeddings> => apiFetch<SaudeEmbeddings>("/faqs/embeddings/health"),
);

/** Quantas FAQs um modo alcançaria — a tela avisa antes de gastar cota. */
export const getAlvoBackfill = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ modo }).parse(data))
  .handler(
    async ({ data }: { data: { modo: ModoBackfill } }): Promise<{ modo: string; total: number }> =>
      apiFetch(`/faqs/embeddings/alvo?modo=${encodeURIComponent(data.modo)}`),
  );

export const diagnosticarEmbeddings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ quantidade: z.number().int().min(1).max(50).default(10) }).parse(data ?? {}),
  )
  .handler(async ({ data }: { data: { quantidade: number } }): Promise<Diagnostico> =>
    apiFetch<Diagnostico>("/faqs/embeddings/diagnosticar", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );

export const iniciarBackfill = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        modo,
        // Teto baixo de propósito: a cota gratuita do Gemini é diária e por
        // projeto. Um limite pequeno faz a pessoa ver o resultado antes de
        // gastar o dia inteiro numa tacada.
        limite: z.number().int().min(1).max(2000).default(200),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
    }: {
      data: { modo: ModoBackfill; limite: number };
    }): Promise<{ jobId: string; total: number; modo: string }> =>
      apiFetch("/faqs/embeddings/backfill", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  );

export const getJobEmbeddings = createServerFn({ method: "GET" }).handler(
  async (): Promise<Job | null> => apiFetch<Job | null>("/faqs/embeddings/job"),
);
