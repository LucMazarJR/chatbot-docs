/**
 * O que a resposta do chat deixou sem resposta.
 *
 * O fluxo com triagem separa a pergunta em partes e diz, para cada uma, se ela
 * foi respondida e com quais FAQs. É isso que manda para a curadoria só a parte
 * que faltou, já escrita como pergunta completa, em vez do tudo ou nada do
 * texto "não encontrei".
 *
 * O fluxo do `/` não manda partes. Para ele continua valendo o texto: a
 * resposta começa com o "não encontrei" fixo do prompt.
 */

/** O texto exato que o prompt manda responder quando nenhum trecho serve. */
export const RE_NAO_ENCONTREI = /^\s*desculpe\s*[—–-]\s*n[ãa]o encontrei/i;

export type ParteDaResposta = {
  /** A parte escrita por inteiro, entendível sem a conversa. */
  pergunta: string;
  respondida: boolean;
  /** As FAQs que a resposta usou nessa parte. */
  faqIds: string[];
};

/**
 * As partes que o fluxo mandou, validadas: vão para o banco e para o painel.
 * Devolve null quando o fluxo não mandou partes ou mandou algo que não dá para
 * ler; aí quem decide é o texto.
 */
export function lerPartes(valor: unknown): ParteDaResposta[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const partes: ParteDaResposta[] = [];
  for (const item of valor.slice(0, 3)) {
    if (!item || typeof item !== 'object') return null;
    const { pergunta, respondida, faqIds } = item as Record<string, unknown>;
    if (typeof pergunta !== 'string' || !pergunta.trim() || typeof respondida !== 'boolean') return null;
    partes.push({
      pergunta: pergunta.trim().slice(0, 400),
      respondida,
      faqIds: Array.isArray(faqIds)
        ? faqIds.filter((id): id is string => typeof id === 'string').map((id) => id.slice(0, 64)).slice(0, 10)
        : [],
    });
  }
  return partes;
}

/**
 * Se a resposta conta como "sem resposta" e quais partes ficaram sem.
 *
 * Com partes, "sem resposta" quer dizer nenhuma parte respondida: a resposta
 * parcial respondeu alguma coisa, e o indicador de lacuna da base não pode
 * contar como falha o que a pessoa recebeu. As partes que faltaram vão em
 * `partesSemResposta`, inclusive quando faltaram todas, porque cada uma é uma
 * pergunta diferente para a curadoria.
 */
export function classificarResposta(
  texto: string,
  partes: ParteDaResposta[] | null,
): { semResposta: boolean; partesSemResposta: string[] } {
  if (!partes) return { semResposta: RE_NAO_ENCONTREI.test(texto), partesSemResposta: [] };
  const faltaram = partes.filter((p) => !p.respondida).map((p) => p.pergunta);
  return { semResposta: faltaram.length === partes.length, partesSemResposta: faltaram };
}
