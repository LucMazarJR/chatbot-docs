'use client';

import { useEffect, useState } from 'react';

import { falar, pararDeFalar, vozSuportada } from '@/lib/leitura-em-voz';

/**
 * O botão "Ouvir" embaixo de cada resposta, no staging.
 *
 * Um toque lê a resposta com a voz do aparelho; outro toque para. Sem voz em
 * português no aparelho, o toque diz isso em vez de ler com sotaque que
 * ninguém entende.
 */
export function OuvirResposta({
  texto,
  aoFalhar,
}: {
  texto: string;
  aoFalhar: (aviso: string) => void;
}) {
  const [falando, setFalando] = useState(false);
  const [suportado, setSuportado] = useState(true);

  useEffect(() => setSuportado(vozSuportada()), []);
  useEffect(() => () => pararDeFalar(), []);

  if (!suportado) return null;

  async function alternar() {
    if (falando) {
      pararDeFalar();
      setFalando(false);
      return;
    }
    setFalando(true);
    const conseguiu = await falar(texto, () => setFalando(false));
    if (!conseguiu) {
      setFalando(false);
      aoFalhar('Este aparelho não tem voz em português instalada. Dá para instalar nas configurações de voz do celular.');
    }
  }

  return (
    <button
      type="button"
      className={'ouvir' + (falando ? ' falando' : '')}
      aria-pressed={falando}
      aria-label={falando ? 'Parar a leitura desta resposta' : 'Ouvir esta resposta em voz alta'}
      onClick={() => void alternar()}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {falando ? (
          <path d="M6 6h12v12H6z" />
        ) : (
          <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23Z" />
        )}
      </svg>
      {falando ? 'Parar' : 'Ouvir'}
    </button>
  );
}
