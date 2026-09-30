/**
 * O que a pessoa fez com o tutorial, e a lembrança disso no aparelho.
 *
 * A oferta aparece só na primeira conversa do aparelho: quem já viu, pulou ou
 * recusou não é perguntado de novo. O passo a passo continua no menu, em
 * "Como usar", para quem quiser rever.
 */

export const ESCOLHAS_DO_TUTORIAL = ['visto', 'pulado', 'recusado', 'ignorado'] as const;
export type EscolhaDoTutorial = (typeof ESCOLHAS_DO_TUTORIAL)[number];

const CHAVE = 'pwa:tutorial';

export function tutorialJaOferecido(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== null;
  } catch {
    // Sem armazenamento (aba privada), oferece: ela some na primeira escolha.
    return false;
  }
}

export function lembrarTutorial(escolha: EscolhaDoTutorial): void {
  try {
    localStorage.setItem(CHAVE, escolha);
  } catch {
    // Vale para esta visita.
  }
}
