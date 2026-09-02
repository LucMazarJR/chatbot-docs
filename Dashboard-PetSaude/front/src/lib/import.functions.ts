import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";

export type EstadoLinha = "ok" | "duplicada" | "invalida";

export type FaqNormalizada = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source: string;
};

export type LinhaValidada = {
  linha: number;
  estado: EstadoLinha;
  /** A pergunta já existe na base, com o texto um pouco diferente. */
  parecida?: boolean;
  motivos: string[];
  contentHash: string;
  faq: FaqNormalizada;
};

export type ResultadoValidacao = {
  itens: LinhaValidada[];
  resumo: { total: number; ok: number; duplicadas: number; invalidas: number };
};

export type EstadoJob = "rodando" | "concluido" | "parado" | "cota_esgotada" | "erro";

export type Job = {
  id: string;
  tipo: string;
  estado: EstadoJob;
  total: number;
  processados: number;
  contadores: Record<string, number>;
  erros: { linha: number; mensagem: string }[];
  errosOmitidos: number;
  mensagem?: string;
  iniciadoEm: string;
  terminadoEm?: string;
  atorNome: string;
};

/**
 * Uma FAQ como o script devolveu, antes de qualquer validação.
 *
 * `unknown` de propósito nos campos: o script é código do usuário e pode
 * devolver qualquer coisa. Apertar o tipo aqui faria o zod recusar o lote
 * inteiro por causa de uma linha torta — justamente a linha que a prévia
 * existe para mostrar.
 */
const faqBruta = z.object({
  question: z.unknown().optional(),
  answer: z.unknown().optional(),
  category: z.unknown().optional(),
  tags: z.unknown().optional(),
  source: z.unknown().optional(),
  linha: z.unknown().optional(),
});

const TETO_LINHAS = 2000;

export const validarImportacao = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        faqs: z
          .array(faqBruta)
          .max(TETO_LINHAS, `O arquivo tem mais de ${TETO_LINHAS} FAQs. Divida em partes.`),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { faqs: unknown[] } }): Promise<ResultadoValidacao> =>
    apiFetch<ResultadoValidacao>("/import/validar", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );

export const commitImportacao = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        faqs: z.array(faqBruta).min(1, "Nada para importar").max(TETO_LINHAS),
        nomeArquivo: z.string().trim().min(1).max(255),
        scriptId: z.string().uuid(),
        scriptVersion: z.number().int().min(1),
        tipoArquivo: z.string().max(20).optional(),
      })
      .parse(data),
  )
  .handler(
    async ({
      data,
    }: {
      data: {
        faqs: unknown[];
        nomeArquivo: string;
        scriptId: string;
        scriptVersion: number;
        tipoArquivo?: string;
      };
    }): Promise<{ jobId: string; total: number }> =>
      apiFetch<{ jobId: string; total: number }>("/import/commit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  );

export const getJobImportacao = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<Job> =>
    apiFetch<Job>(`/import/jobs/${data.id}`),
  );

/**
 * A importação em andamento, se houver.
 *
 * Serve para a tela reaberta reencontrar um trabalho que continua rodando, em
 * vez de oferecer começar outro e receber um 409 do backend.
 */
export const getImportacaoEmAndamento = createServerFn({ method: "GET" }).handler(
  async (): Promise<Job | null> => apiFetch<Job | null>("/import/jobs/andamento"),
);

export const pararImportacao = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<Job> =>
    apiFetch<Job>(`/import/jobs/${data.id}/parar`, { method: "POST" }),
  );
