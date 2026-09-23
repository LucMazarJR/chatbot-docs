import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";

/**
 * Conversas do protótipo PWA.
 *
 * Só leitura: quem escreve é o chatbot. Todas as rotas exigem papel admin no
 * backend: o conteúdo é relato de sintoma e pedido de atendimento escrito por
 * cidadãos identificáveis pelo que contam.
 */

export const PERIODOS = ["hoje", "7d", "30d", "tudo"] as const;
export const VERSOES = ["a", "b", "todas"] as const;
export const SITUACOES = [
  "validas",
  "todas",
  "negativos",
  "nota-baixa",
  "sem-resposta",
  "com-erro",
] as const;

export type Periodo = (typeof PERIODOS)[number];
export type FiltroVersao = (typeof VERSOES)[number];
export type Situacao = (typeof SITUACOES)[number];

export type Avaliacao = {
  estrelas: number | null;
  nps: number | null;
  comentario: string | null;
  avaliadaEm: string;
};

export type TrechoUsado = {
  score: number;
  usado: boolean;
  faqId: string | null;
  category: string | null;
  question: string | null;
  previa: string | null;
};

export type MensagemConversa = {
  _id: string;
  sessaoId: string;
  papel: "user" | "bot";
  texto: string;
  em: string;
  latenciaMs?: number;
  temContexto?: boolean | null;
  qtdTrechos?: number | null;
  trechosDebug?: TrechoUsado[];
  limiarScore?: number | null;
  modelo?: string | null;
  semResposta?: boolean;
  erro?: boolean;
  motivoErro?: string | null;
  feedback?: "up" | "down" | null;
  feedbackComentario?: string | null;
};

export type ConversaResumida = {
  _id: string;
  nome: string;
  versao?: "a" | "b";
  iniciadaEm: string;
  encerradaEm: string | null;
  avaliacao: Avaliacao | null;
  qtdMensagens: number;
  qtdPerguntas: number;
  positivos: number;
  negativos: number;
  semResposta: number;
  erros: number;
  latenciaMaxima: number | null;
  /** Presente quando a conversa foi feita com conta. O painel só mostra que existe. */
  usuarioId?: string;
};

export type EstatisticasConversas = {
  sessoes: number;
  sessoesVazias: number;
  sessoesAvaliadas: number;
  mensagens: number;
  respostas: number;
  notaMedia: number | null;
  npsMedio: number | null;
  npsScore: number | null;
  percentualSemResposta: number | null;
  erros: number;
  positivos: number;
  negativos: number;
  latenciaMedia: number | null;
  latenciaP95: number | null;
  respostasLentas: number;
};

const recorte = z.object({
  periodo: z.enum(PERIODOS).default("tudo"),
  versao: z.enum(VERSOES).default("todas"),
});

const recorteComSituacao = recorte.extend({
  situacao: z.enum(SITUACOES).default("validas"),
});

/** Omite o que está no padrão, como em faq.functions.ts. */
function montarQuery(dados: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor) p.set(chave, valor);
  }
  return p.toString();
}

export const getEstatisticasConversas = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => recorte.parse(data ?? {}))
  .handler(async ({ data }): Promise<EstatisticasConversas> =>
    apiFetch<EstatisticasConversas>(`/conversas/estatisticas?${montarQuery(data)}`),
  );

export const listarConversas = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => recorteComSituacao.parse(data ?? {}))
  .handler(async ({ data }): Promise<ConversaResumida[]> =>
    apiFetch<ConversaResumida[]>(`/conversas?${montarQuery(data)}`),
  );

export const detalharConversa = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(
    async ({ data }): Promise<{ sessao: ConversaResumida; mensagens: MensagemConversa[] } | null> =>
      apiFetch(`/conversas/${encodeURIComponent(data.id)}`),
  );

/**
 * Exclusão a pedido da pessoa. Apaga a conversa e troca as cópias das perguntas
 * guardadas pela curadoria por uma marca: ver ConversasService.apagar.
 */
export const apagarConversa = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(
    async ({
      data,
    }: {
      data: { id: string };
    }): Promise<{ ok: true; mensagens: number; sugestoes: number; rodadas: number }> =>
      apiFetch(`/conversas/${encodeURIComponent(data.id)}`, { method: "DELETE" }),
  );
