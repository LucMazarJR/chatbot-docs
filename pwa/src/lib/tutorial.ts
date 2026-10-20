/**
 * O que a pessoa fez com o tutorial, e a lembrança disso no aparelho.
 *
 * O passo a passo abre sozinho só na primeira conversa do aparelho: quem já
 * viu ou pulou não o vê abrir de novo. Ele continua no menu, em "Como usar",
 * para quem quiser rever.
 *
 * `recusado` e `ignorado` são do tempo em que ele era um convite na conversa.
 * Continuam aceitos porque estão gravados em sessões antigas e no aparelho de
 * quem respondeu ao convite, e o relatório do painel ainda os conta.
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
