/**
 * Quando o chat pode abrir a avaliação sozinho.
 *
 * LÓGICA DO LUCIANO: no primeiro teste de campo a folha abriu enquanto a pessoa
 * esperava uma resposta de 100 segundos. O relógio contava a partir da resposta
 * anterior e não parava para nada: nem para quem digitava, nem para quem
 * esperava. Ela deu nota, a nota encerrou a conversa, e ela não perguntou mais
 * nada. A folha oferecida no meio da conversa virou o fim dela.
 *
 * A decisão fica aqui, fora do componente, para ser testada sozinha.
 */

/** Tempo parado de verdade antes de oferecer a avaliação. */
export const INATIVIDADE_MS = 2 * 60 * 1000;

/** Quem mal começou a conversar não é abordado. */
export const MINIMO_PERGUNTAS_PARA_AVALIAR = 3;

export type EstadoDaConversa = {
  perguntas: number;
  encerrada: boolean;
  /** Já abriu sozinha nesta conversa: não insiste. */
  jaOfereceu: boolean;
  esperandoResposta: boolean;
  gravando: boolean;
  /** Há texto no campo: a pessoa está no meio de uma pergunta. */
  textoNoCampo: boolean;
  /** Menu, acessibilidade ou a confirmação de apagar estão abertos. */
  outroPainelAberto: boolean;
  /** A aba está à vista. Oferecer a quem não está olhando é perder a oferta. */
  abaVisivel: boolean;
};

export type Decisao =
  /** Abre a folha agora. */
  | 'oferecer'
  /** Não agora: a pessoa está ocupada. Tentar de novo depois de outro intervalo. */
  | 'adiar'
  /** Nunca mais nesta conversa. */
  | 'desistir';

export function decidirAvaliacao(estado: EstadoDaConversa): Decisao {
  if (estado.encerrada || estado.jaOfereceu) return 'desistir';
  if (estado.perguntas < MINIMO_PERGUNTAS_PARA_AVALIAR) return 'adiar';
  if (
    estado.esperandoResposta ||
    estado.gravando ||
    estado.textoNoCampo ||
    estado.outroPainelAberto ||
    !estado.abaVisivel
  ) {
    return 'adiar';
  }
  return 'oferecer';
}
