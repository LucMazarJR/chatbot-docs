/**
 * As etapas da resposta que a tela mostra enquanto espera.
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

/**
 * Em quantos segundos cada etapa costuma andar a maior parte do caminho: a
 * reescrita leva de 2 a 17 s, a busca uns 2 s, e a escrita de 3 a 25 s.
 */
const RITMO_DA_ETAPA_S: Record<EtapaDaResposta, number> = {
  entendendo: 6,
  buscando: 1.5,
  escrevendo: 8,
};

/** O trecho da etapa nasce com um pouco de cor, para a barra não começar vazia. */
const COMECO_DO_TRECHO = 0.08;

/** Até onde o trecho enche sozinho: só o aviso da etapa seguinte o completa. */
export const TETO_DO_TRECHO = 0.9;

/**
 * Quanto do seu trecho da barra a etapa atual já encheu, de 0 a 1.
 *
 * Ninguém sabe quando a etapa termina, então o trecho anda rápido no começo e
 * cada vez mais devagar, sem nunca chegar ao fim. Parado, parecia travado;
 * cheio antes da hora, parecia que a resposta já tinha chegado.
 */
export function avancoDaEtapa(etapa: EtapaDaResposta, passouMs: number): number {
  const fracao = 1 - Math.exp(-Math.max(0, passouMs) / 1000 / RITMO_DA_ETAPA_S[etapa]);
  return COMECO_DO_TRECHO + (TETO_DO_TRECHO - COMECO_DO_TRECHO) * fracao;
}

/** A partir de quando a caixa avisa que pode demorar: antes disso, a espera é a comum. */
export const CALMA_MS = 25_000;

/** A partir de quando a espera já passou do normal, e o recado muda. */
export const LENTO_MS = 60_000;

/**
 * A linha da caixa para quem está esperando há mais tempo que o comum, ou
 * nada. É o que impede a pessoa de reenviar a pergunta ou fechar a aba. Faz o
 * papel dos recados de demora que, no `/`, chegam como mensagem na conversa.
 */
export function recadoDaEspera(passouMs: number): string | null {
  if (passouMs >= LENTO_MS) return 'Hoje está mais lento que o normal. Não precisa enviar de novo.';
  if (passouMs >= CALMA_MS) return 'Pode levar até 1 minuto. Não precisa enviar de novo.';
  return null;
}

/**
 * Quanto cada trecho da barra está cheio: as etapas que já passaram ficam
 * cheias, a atual mostra o seu avanço, e as que faltam ficam vazias.
 *
 * `concluindo`: a etapa seguinte já chegou, e o trecho atual corre até o fim
 * antes de a tela passar para ela. Sem essa pausa, o trecho seguinte começava
 * a andar enquanto o anterior ainda enchia, e os dois pareciam disputar.
 */
export function trechosDaBarra(etapa: EtapaDaResposta, passouMs: number, concluindo = false): number[] {
  const atual = ETAPAS.indexOf(etapa);
  return ETAPAS.map((_, indice) =>
    indice < atual ? 1 : indice === atual ? (concluindo ? 1 : avancoDaEtapa(etapa, passouMs)) : 0,
  );
}
