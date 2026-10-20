/**
 * As etapas da resposta que a tela mostra enquanto espera (staging).
 *
 * O fluxo do n8n avisa ao entrar em cada uma, e a tela troca "digitando…" pelo
 * que está acontecendo. Três pontinhos parados por 40 s pareciam travamento, e
 * o recado dos 20 s dizia "procurando" mesmo quando a busca já tinha acabado e
 * o modelo estava escrevendo. Vale no servidor (a rota confere o nome) e na
 * tela.
 */
export const ETAPAS = ['entendendo', 'buscando', 'escrevendo'] as const;

export type EtapaDaResposta = (typeof ETAPAS)[number];

/** A frase do balão. Curta: é lida de relance, com a letra no máximo. */
export const TEXTO_DA_ETAPA: Record<EtapaDaResposta, string> = {
  entendendo: 'Lendo sua pergunta',
  buscando: 'Procurando a informação',
  escrevendo: 'Escrevendo a resposta',
};

export function etapaValida(valor: unknown): EtapaDaResposta | null {
  return ETAPAS.find((etapa) => etapa === valor) ?? null;
}
