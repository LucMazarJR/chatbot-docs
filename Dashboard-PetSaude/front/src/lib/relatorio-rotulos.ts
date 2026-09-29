import type { TomDoSelo } from "@/components/selo";
import type { CausaPergunta, PublicoPergunta, SituacaoPergunta } from "@/lib/relatorios.functions";

/**
 * Os nomes e as cores do relatório do dia, num lugar só.
 *
 * A tela e o PDF leem daqui. Com duas cópias, o PDF que vai para o grupo
 * acabaria chamando de um jeito o que a tela chama de outro.
 */

export const ROTULO_SITUACAO: Record<SituacaoPergunta, string> = {
  respondida: "Respondida",
  sem_resposta: "Sem resposta",
  falhou: "Falhou",
  sem_retorno: "Sem retorno",
};

export const TOM_SITUACAO: Record<SituacaoPergunta, TomDoSelo> = {
  respondida: "sucesso",
  sem_resposta: "atencao",
  falhou: "erro",
  sem_retorno: "erro",
};

export const ROTULO_CAUSA: Record<CausaPergunta, string> = {
  respondida: "Respondida",
  respondida_revisar: "Respondida, vale revisar",
  falta_conteudo: "A base não tem o conteúdo",
  busca_nao_trouxe: "A base tem, a busca não trouxe",
  sem_contexto: "Dependia da pergunta anterior",
  fora_de_escopo: "Fora do escopo",
  falha_tecnica: "Falha técnica",
  nao_classificada: "Sem classificação da IA",
};

export const ROTULO_PUBLICO: Record<PublicoPergunta, string> = {
  cidadao: "Cidadão",
  profissional: "Profissional de saúde",
  fora_de_escopo: "Fora do escopo",
};

/**
 * As cores das barras por área.
 *
 * LÓGICA DO LUCIANO: são as cores de estado de referência, e não as do tema do
 * painel. As do painel (verde, âmbar e vermelho escuros) foram passadas no
 * validador de daltonismo e reprovaram como preenchimento: o âmbar e o vermelho
 * viram quase a mesma cor para quem tem deuteranopia, justamente o par que
 * separa "sem resposta" de "falhou". Estas passam nos dois temas. O âmbar fica
 * com pouco contraste sobre o fundo claro, e por isso cada barra traz o número
 * escrito ao lado e a legenda fica sempre à vista: a cor nunca é a única pista.
 */
export const COR_DA_BARRA = {
  respondidas: "#0ca30c",
  semResposta: "#fab219",
  falhas: "#d03b3b",
} as const;

/** 9,8 s */
export function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/** 61% */
export function percentual(parte: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

/** "1 pergunta", "3 perguntas". */
export function plural(n: number, singular: string, pluralForma: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : pluralForma}`;
}
