'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { posicionarBalao, type Caixa } from '@/lib/posicao-do-balao';
import { useFocoPreso } from '@/lib/usar-foco-preso';

export type PassoDoTutorial = {
  /** Seletor do elemento real da tela que o passo mostra. Sem alvo, o balão fica no meio. */
  alvo: string | null;
  titulo: string;
  texto: string;
  /** Um desenho de exemplo dentro do balão, para o que ainda não existe na tela. */
  exemplo?: ReactNode;
};

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
  const [tela, setTela] = useState({ largura: 390, altura: 800 });
  const [larguraDoBalao, setLarguraDoBalao] = useState(320);
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
    setTela({ largura: window.innerWidth, altura: window.innerHeight });
    // A largura vem do CSS (em, que segue o tamanho do texto escolhido em
    // Acessibilidade), e só a caixa já desenhada sabe quanto deu.
    if (balaoRef.current) setLarguraDoBalao(balaoRef.current.offsetWidth);
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

  // A caixa fica do lado do elemento que tem mais espaço, alinhada a ele, e a
  // seta aponta para o centro dele (lib/posicao-do-balao.ts).
  const pos = posicionarBalao({
    alvo: caixa,
    larguraDaTela: tela.largura,
    alturaDaTela: tela.altura,
    larguraDoBalao,
  });
  const posicao = {
    left: pos.left,
    maxHeight: pos.maxHeight,
    ...(pos.lado === 'centro'
      ? { top: '50%', translate: '0 -50%' }
      : pos.lado === 'acima'
        ? { bottom: pos.bottom }
        : { top: pos.top }),
    ...(pos.setaX !== null ? { '--seta-x': `${pos.setaX}px` } : {}),
  } as React.CSSProperties;

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
        className={`tutorial-balao ${pos.lado}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-titulo"
        aria-describedby="tutorial-texto"
        style={posicao}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') pular();
        }}
      >
        {/* Só o texto rola. Os botões ficam fora da rolagem, para Pular e
            Próximo estarem sempre à vista mesmo com a letra no máximo. */}
        <div className="tutorial-conteudo">
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
        </div>

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
