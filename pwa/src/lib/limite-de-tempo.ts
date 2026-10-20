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
 * Com limite é o padrão: é o modo que resolve a espera longa, e quem quiser
 * comparar troca. Fica no aparelho, como as outras escolhas do staging.
 */
const CHAVE = 'pwa:limite-de-tempo';

export function lerLimiteDeTempo(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'sem';
  } catch {
    return true;
  }
}

export function guardarLimiteDeTempo(comLimite: boolean): void {
  try {
    localStorage.setItem(CHAVE, comLimite ? 'com' : 'sem');
  } catch {
    // Vale para esta visita.
  }
}
