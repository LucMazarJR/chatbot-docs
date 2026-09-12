import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiFetch } from "./api.server";
import type { Job } from "./import.functions";

export type FilaCuradoria = {
  pendentes: number;
  /** Chegou ao tamanho da rodada — vale a pena gastar a chamada. */
  prontoParaRodar: boolean;
  tamanhoDaRodada: number;
};

export type LacunaNaFila = {
  mensagemId: string;
  sessaoId: string;
  em: string;
  pergunta: string;
  vizinhas: { faqId: string | null; question: string | null; score: number; previa: string | null }[];
};

export type OrigemSugestao = {
  sessaoId: string;
  mensagemId: string;
  /** A pergunta como o cidadão escreveu, sem correção. */
  pergunta: string;
  em: string;
};

export type Sugestao = {
  id: string;
  estado: "pendente" | "aprovada" | "descartada";
  tipo: "nova" | "complemento";
  pergunta: string;
  /** Vazio quando as FAQs próximas não continham a informação. */
  rascunhoResposta: string;
  categoriaSugerida: string | null;
  tagsSugeridas: string[];
  faqRelacionadaId: string | null;
  justificativa: string;
  origens: OrigemSugestao[];
  criadaEm: string;
  criadaPor: string | null;
  modelo: string | null;
  faqCriadaId: string | null;
};

export const getFilaCuradoria = createServerFn({ method: "GET" }).handler(
  async (): Promise<FilaCuradoria> => apiFetch<FilaCuradoria>("/curadoria/fila"),
);

export const listarLacunas = createServerFn({ method: "GET" }).handler(
  async (): Promise<LacunaNaFila[]> => apiFetch<LacunaNaFila[]>("/curadoria/fila/itens"),
);

export const listarSugestoes = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({ estado: z.enum(["pendente", "aprovada", "descartada"]).default("pendente") })
      .parse(data ?? {}),
  )
  .handler(
    async ({
      data,
    }: {
      data: { estado: "pendente" | "aprovada" | "descartada" };
    }): Promise<{ itens: Sugestao[]; total: number }> =>
      apiFetch(`/curadoria/sugestoes?estado=${data.estado}`),
  );

export type RodadaResumida = {
  id: string;
  estado: "rodando" | "concluida" | "erro" | "cota_esgotada";
  iniciadaEm: string;
  terminadaEm: string | null;
  atorNome: string;
  modelo: string | null;
  erro: string | null;
  /** As perguntas que entraram nesta rodada, congeladas como estavam. */
  perguntas: { mensagemId: string; sessaoId: string; pergunta: string }[];
  sugestoesCriadas: string[];
  foraDeEscopo: string[];
};

export type RodadaDetalhada = Omit<RodadaResumida, "perguntas"> & {
  /** O JSON que o modelo devolveu, palavra por palavra. */
  respostaBruta: string;
  lacunas: {
    mensagemId: string;
    sessaoId: string;
    pergunta: string;
    vizinhas: { faqId: string | null; question: string | null; score: number }[];
  }[];
};

export const listarRodadas = createServerFn({ method: "GET" }).handler(
  async (): Promise<RodadaResumida[]> => apiFetch<RodadaResumida[]>("/curadoria/rodadas"),
);

export const detalharRodada = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(
    async ({ data }: { data: { id: string } }): Promise<RodadaDetalhada> =>
      apiFetch<RodadaDetalhada>(`/curadoria/rodadas/${encodeURIComponent(data.id)}`),
  );

export const getJobCuradoria = createServerFn({ method: "GET" }).handler(
  async (): Promise<Job | null> => apiFetch<Job | null>("/curadoria/job"),
);

export const analisarLacunas = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ jobId: string }> =>
    apiFetch("/curadoria/analisar", { method: "POST" }),
);

export const aprovarSugestao = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().min(1),
        question: z.string().trim().min(5).max(300),
        answer: z.string().trim().min(5, "Escreva a resposta antes de aprovar").max(4000),
        category: z.string().trim().max(60).optional(),
        tags: z.array(z.string().trim().min(2).max(30)).optional(),
      })
      .parse(data),
  )
  .handler(
    async ({ data }: { data: { id: string } & Record<string, unknown> }): Promise<{
      ok: true;
      faqId: string;
      semEmbedding: boolean;
    }> => {
      const { id, ...corpo } = data;
      return apiFetch(`/curadoria/sugestoes/${encodeURIComponent(id)}/aprovar`, {
        method: "POST",
        body: JSON.stringify(corpo),
      });
    },
  );

export const descartarSugestao = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<{ ok: true }> =>
    apiFetch(`/curadoria/sugestoes/${encodeURIComponent(data.id)}/descartar`, { method: "POST" }),
  );
