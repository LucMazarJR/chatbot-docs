'use client';

/**
 * Staging: como o assistente espera a resposta do Gemini, escolhido em Minha
 * conta, para o grupo comparar os dois modos.
 *
 * Com limite: cada modelo tem um prazo, e passado o último o assistente avisa
 * para perguntar de novo, por volta de 1 minuto e meio no pior caso. Sem
 * limite: o agente de sempre, que espera o quanto o Gemini precisar, até o
 * teto de 4 minutos do servidor; com o Gemini congestionado, uma resposta
 * chegou a levar quase 2 minutos.
 *
 * Sem limite é o padrão enquanto o grupo valida a reescrita e mede quanto cada
 * etapa demora de verdade: com limite, as etapas lentas seriam cortadas antes
 * de terminar, e a medição mostraria o prazo, e não o tempo real. Quem quiser
 * comparar troca. Fica no aparelho, como as outras escolhas do chat.
 */
const CHAVE = 'pwa:limite-de-tempo';

export function lerLimiteDeTempo(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'com';
  } catch {
    return false;
  }
}

export function guardarLimiteDeTempo(comLimite: boolean): void {
  try {
    localStorage.setItem(CHAVE, comLimite ? 'com' : 'sem');
  } catch {
    // Vale para esta visita.
  }
}
