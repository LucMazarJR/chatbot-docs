'use client';

import { useEffect } from 'react';

/**
 * Publica a altura e o topo da área visível da tela em `--altura-visivel` e
 * `--topo-visivel`, que o chat usa para ocupar exatamente o que se vê.
 *
 * LÓGICA DO LUCIANO: no iPhone, abrir o teclado não encolhe o `100dvh`: o
 * Safari rola a página inteira para cima, e o cabeçalho sai da vista. E a
 * barra de endereço, ao aparecer e sumir, mudava o `dvh` no meio da conversa,
 * e a tela "respirava". O `visualViewport` diz o que de fato está visível,
 * com e sem teclado, e o chat se prende a ele. Sem a API, vale o `100dvh` de
 * reserva no CSS.
 */
export function AlturaVisivel() {
  useEffect(() => {
    const vista = window.visualViewport;
    if (!vista) return;
    const raiz = document.documentElement;
    let quadro = 0;
    const medir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        raiz.style.setProperty('--altura-visivel', `${vista.height}px`);
        raiz.style.setProperty('--topo-visivel', `${vista.offsetTop}px`);
      });
    };
    medir();
    vista.addEventListener('resize', medir);
    vista.addEventListener('scroll', medir);
    return () => {
      cancelAnimationFrame(quadro);
      vista.removeEventListener('resize', medir);
      vista.removeEventListener('scroll', medir);
    };
  }, []);
  return null;
}
