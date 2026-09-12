'use client';

import { useEffect, type RefObject } from 'react';

const FOCAVEIS = 'button:not([disabled]), textarea, [href], input:not([type="file"]), select';

/**
 * Prende o foco dentro de um diálogo e devolve ao sair.
 *
 * LÓGICA DO LUCIANO: `aria-modal="true"` é uma promessa ao leitor de tela, não
 * um comportamento — o navegador não faz nada com ele. A folha de avaliação se
 * declarava modal e não era: o foco continuava na conversa atrás dela, e quem
 * navegava por teclado seguia tabulando por balões e polegares invisíveis sob a
 * cortina, sem nunca alcançar as estrelas, e sem como fechar.
 *
 * Devolver o foco a quem abriu é a outra metade. Sem isso, fechar o diálogo
 * joga o foco no começo da página e a pessoa refaz o caminho inteiro.
 */
export function useFocoPreso(
  alvo: RefObject<HTMLElement | null>,
  aoFechar: () => void,
): void {
  useEffect(() => {
    const previamenteFocado = document.activeElement as HTMLElement | null;
    const focaveis = () =>
      Array.from(alvo.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);

    focaveis()[0]?.focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        aoFechar();
        return;
      }
      if (evento.key !== 'Tab') return;

      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];

      // Só interfere nas bordas: no meio da lista o Tab do navegador já faz a
      // coisa certa, e reimplementá-lo seria trocar um comportamento testado
      // por um palpite.
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      previamenteFocado?.focus?.();
    };
  }, [alvo, aoFechar]);
}
