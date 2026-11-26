import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiFetch } from "./api.server";

export type PeriodoUbs = "hoje" | "7d" | "30d" | "tudo";
/** `lista`: a pessoa tocou na unidade na lista do chat. Os outros vêm do texto digitado. */
export type ComoIdentificou = "lista" | "nome" | "corrigida" | "aproximada";

/** Números de um recorte: uma unidade de saúde, ou todas as conversas do período. */
export type Resumo = {
  conversas: number;
  perguntas: number;
  /** Respostas em que o assistente não achou o que responder. */
  semResposta: number;
  negativos: number;
  positivos: number;
  avaliacoes: number;
  notaMedia: number | null;
  ultimaEm: string | null;
  /** Sobre as conversas com unidade reconhecida. */
  percentual: number;
  /** Sobre as perguntas. Nulo sem perguntas. */
  percentualSemResposta: number | null;
};

export type Tema = { categoria: string; respostas: number };

export type LinhaUbs = Resumo & {
  id: string;
  nome: string;
  /** As três categorias de FAQ mais usadas nas respostas da unidade. */
  temas: Tema[];
};

/** Conversas por intervalo de tempo, no total e por unidade. */
export type SerieUbs = {
  granularidade: "hora" | "dia" | "semana";
  /** Começo de cada intervalo, no fuso da equipe: "2026-11-26" ou "2026-11-26T14". */
  intervalos: string[];
  total: number[];
  porUnidade: Record<string, number[]>;
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
  /** Todas as conversas do período, como referência para ler cada unidade. */
  geral: Resumo;
  porUbs: LinhaUbs[];
  serie: SerieUbs;
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

export type ResultadoDoLote = {
  criadas: string[];
  jaExistiam: string[];
  recusadas: { nome: string; motivo: string }[];
};

/** Uma unidade por linha, como a lista oficial chega numa planilha ou mensagem. */
export const criarUbsEmLote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ nomes: z.array(z.string().max(200)).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) =>
    apiFetch<ResultadoDoLote>("/ubs/lote", { method: "POST", body: JSON.stringify(data) }),
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
