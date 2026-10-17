'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { useFocoPreso } from '@/lib/usar-foco-preso';

export type PassoDoTutorial = {
  /** Seletor do elemento real da tela que o passo mostra. Sem alvo, o balão fica no meio. */
  alvo: string | null;
  titulo: string;
  texto: string;
  /** Um desenho de exemplo dentro do balão, para o que ainda não existe na tela. */
  exemplo?: ReactNode;
};

type Caixa = { top: number; left: number; width: number; height: number };

/** Folga em volta do destaque, para ele não colar no elemento. */
const FOLGA = 6;

/**
 * O passo a passo de como usar o chat, por cima da tela real.
 *
 * LÓGICA DO LUCIANO: no primeiro teste de campo, uma participante idosa não
 * sabia por onde começar, mesmo o chat sendo igual ao WhatsApp. Um texto
 * explicando não resolveria: ela precisava ver ONDE tocar. Cada passo acende
 * o elemento de verdade e escurece o resto, e o balão fica ao lado dele.
 *
 * Quem não precisa sai em um toque: Pular está em todo passo, e Esc também
 * fecha. O foco fica preso no balão, e o leitor de tela lê o passo inteiro ao
 * trocar. O tamanho do texto segue o da acessibilidade, porque é justamente
 * quem usa letra grande que mais precisa deste passo a passo.
 */
export function Tutorial({
  passos,
  aoTerminar,
}: {
  passos: PassoDoTutorial[];
  aoTerminar: (motivo: 'visto' | 'pulado') => void;
}) {
  const [indice, setIndice] = useState(0);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const balaoRef = useRef<HTMLDivElement>(null);
  const passo = passos[indice];
  const ultimo = indice === passos.length - 1;

  const pular = useCallback(() => aoTerminar('pulado'), [aoTerminar]);
  useFocoPreso(balaoRef, pular);

  // O teclado do celular aberto empurra a tela e o destaque ficaria fora do
  // lugar: o passo a passo começa com ele fechado.
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const medir = useCallback(() => {
    if (!passo.alvo) {
      setCaixa(null);
      return;
    }
    const elemento = document.querySelector(passo.alvo);
    if (!elemento) {
      setCaixa(null);
      return;
    }
    const r = elemento.getBoundingClientRect();
    setCaixa({
      top: r.top - FOLGA,
      left: r.left - FOLGA,
      width: r.width + FOLGA * 2,
      height: r.height + FOLGA * 2,
    });
  }, [passo.alvo]);

  useLayoutEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [medir]);

  // A cada passo, o foco vai para o título: o leitor de tela lê o passo novo,
  // e quem usa teclado continua dentro do balão.
  useEffect(() => {
    balaoRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [indice]);

  // O balão fica do lado que tem mais espaço: em cima do campo de mensagem,
  // embaixo do menu do topo.
  const alturaDaTela = typeof window === 'undefined' ? 800 : window.innerHeight;
  const acima = caixa ? caixa.top > alturaDaTela / 2 : false;
  const posicao: React.CSSProperties = caixa
    ? acima
      ? { bottom: alturaDaTela - caixa.top + 12 }
      : { top: caixa.top + caixa.height + 12 }
    : { top: '50%', transform: 'translateY(-50%)' };

  return (
    <div className="tutorial" role="presentation">
      {caixa ? (
        <div
          className="tutorial-destaque"
          aria-hidden="true"
          style={{ top: caixa.top, left: caixa.left, width: caixa.width, height: caixa.height }}
        />
      ) : (
        <div className="tutorial-fundo" aria-hidden="true" />
      )}

      <div
        ref={balaoRef}
        className="tutorial-balao"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-titulo"
        aria-describedby="tutorial-texto"
        style={posicao}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') pular();
        }}
      >
        <p className="tutorial-passo">
          Passo {indice + 1} de {passos.length}
        </p>
        <h2 id="tutorial-titulo" tabIndex={-1}>
          {passo.titulo}
        </h2>
        <p id="tutorial-texto">{passo.texto}</p>
        {passo.exemplo && (
          <div className="tutorial-exemplo" aria-hidden="true">
            {passo.exemplo}
          </div>
        )}

        <div className="tutorial-acoes">
          <button type="button" className="tutorial-pular" onClick={pular}>
            Pular
          </button>
          <span className="tutorial-navegar">
            {indice > 0 && (
              <button type="button" onClick={() => setIndice((i) => i - 1)}>
                Voltar
              </button>
            )}
            <button
              type="button"
              className="tutorial-proximo"
              onClick={() => (ultimo ? aoTerminar('visto') : setIndice((i) => i + 1))}
            >
              {ultimo ? 'Começar a usar' : 'Próximo'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
