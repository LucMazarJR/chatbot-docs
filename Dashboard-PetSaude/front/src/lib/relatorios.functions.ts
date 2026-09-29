import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";

/**
 * O relatório do dia do chatbot.
 *
 * Os números vêm contados do banco pelo backend; a IA só classifica cada
 * pergunta e escreve o resumo. As rotas exigem papel admin: o relatório lista,
 * uma por uma, as perguntas que cidadãos escreveram.
 */

export type EstadoRelatorio = "rodando" | "concluido" | "erro" | "cota_esgotada" | "interrompido";

export type SituacaoPergunta = "respondida" | "sem_resposta" | "falhou" | "sem_retorno";

export type CausaPergunta =
  | "respondida"
  | "respondida_revisar"
  | "falta_conteudo"
  | "busca_nao_trouxe"
  | "sem_contexto"
  | "fora_de_escopo"
  | "falha_tecnica"
  | "nao_classificada";

export type PublicoPergunta = "cidadao" | "profissional" | "fora_de_escopo";

export type NumerosDoDia = {
  conversas: number;
  perguntas: number;
  respondidas: number;
  semResposta: number;
  falhas: number;
  semRetorno: number;
  positivos: number;
  negativos: number;
  avaliacoes: number;
  notaMedia: number | null;
  npsMedio: number | null;
  comentarios: string[];
  latenciaMediana: number | null;
  latenciaP90: number | null;
  latenciaMaxima: number | null;
  respostasAcimaDe60s: number;
  aceitaramSemPerguntar: number;
  tentativasDeAudioOuArquivo: number;
};

export type ContagemPorArea = {
  area: string;
  total: number;
  respondidas: number;
  semResposta: number;
  falhas: number;
  /** O que a IA disse da área: o resumo por grande assunto. */
  nota?: string;
};

export type EscopoParaRevisar = {
  tema: string;
  /** Posições em `perguntas`, base 0. */
  perguntas: number[];
  motivo: string;
  sugestao: string;
};

export type PerguntaDoRelatorio = {
  perguntaId: string;
  sessaoId: string;
  participante: string;
  em: string;
  pergunta: string;
  situacao: SituacaoPergunta;
  feedback: "up" | "down" | null;
  latenciaMs: number | null;
  area: string | null;
  publico: PublicoPergunta | null;
  causa: CausaPergunta | null;
  comentario: string;
};

export type RelatorioDoDia = {
  id: string;
  /** AAAA-MM-DD, no fuso de Brasília. */
  data: string;
  estado: EstadoRelatorio;
  iniciadoEm: string;
  terminadoEm: string | null;
  atorNome: string;
  modelo: string | null;
  erro: string | null;
  andamento: { processados: number; total: number } | null;
  numeros: NumerosDoDia | null;
  porArea: ContagemPorArea[];
  porCausa: Partial<Record<CausaPergunta, number>>;
  escopos: EscopoParaRevisar[];
  /** Frases do topo, escritas pelo código a partir das contagens. */
  destaques: string[];
  resumo: string;
  perguntas: PerguntaDoRelatorio[];
};

export type RelatorioResumido = {
  id: string;
  data: string;
  estado: EstadoRelatorio;
  iniciadoEm: string;
  terminadoEm: string | null;
  atorNome: string;
  modelo: string | null;
  erro: string | null;
  perguntas: number | null;
  semResposta: number | null;
};

export const listarRelatorios = createServerFn({ method: "GET" }).handler(
  async (): Promise<RelatorioResumido[]> => apiFetch<RelatorioResumido[]>("/relatorios"),
);

export const detalharRelatorio = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<RelatorioDoDia> => {
    const relatorio = await apiFetch<RelatorioDoDia>(`/relatorios/${encodeURIComponent(data.id)}`);
    // Campo que o back ainda não manda chega como lista vazia. Acontece no
    // intervalo em que o front novo já saiu e o back novo ainda está subindo,
    // e com relatório gravado antes de o campo existir.
    return {
      ...relatorio,
      destaques: relatorio.destaques ?? [],
      escopos: relatorio.escopos ?? [],
      porArea: relatorio.porArea ?? [],
      porCausa: relatorio.porCausa ?? {},
      perguntas: relatorio.perguntas ?? [],
    };
  });

export const gerarRelatorio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha o dia do relatório."),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { data: string } }): Promise<{ id: string }> =>
    apiFetch("/relatorios", { method: "POST", body: JSON.stringify({ data: data.data }) }),
  );
