'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onEnviar: (avaliacao: {
    estrelas: number | null;
    nps: number | null;
    comentario: string;
  }) => Promise<void>;
  onVoltar: () => void;
};

/**
 * Folha de avaliação do fim da conversa.
 *
 * Três perguntas numa tela só: nota de satisfação, NPS e o campo aberto. Todas
 * opcionais — cobrar resposta de quem só queria encerrar a conversa é a melhor
 * forma de não receber nenhuma.
 */
export function FolhaAvaliacao({ onEnviar, onVoltar }: Props) {
  const [estrelas, setEstrelas] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const folhaRef = useRef<HTMLDivElement>(null);

  /**
   * Foco preso dentro da folha, e Esc para desistir.
   *
   * LÓGICA DO LUCIANO: a folha se declarava `aria-modal="true"` e não era modal
   * coisa nenhuma. O foco continuava na conversa atrás dela, então quem navega
   * por teclado abria a avaliação e seguia tabulando pelos balões, pelos
   * polegares e pelo campo de mensagem — tudo invisível sob a cortina — sem
   * nunca alcançar as estrelas. E não havia como fechar sem o mouse.
   *
   * O `previamenteFocado` devolve o foco a quem abriu: sem isso, fechar a folha
   * joga o foco no começo da página, e a pessoa recomeça a conversa do zero.
   */
  useEffect(() => {
    const previamenteFocado = document.activeElement as HTMLElement | null;
    const focaveis = () =>
      Array.from(
        folhaRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea, [href], input, select',
        ) ?? [],
      );

    focaveis()[0]?.focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        onVoltar();
        return;
      }
      if (evento.key !== 'Tab') return;

      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];

      // Só interfere nas bordas: no meio da lista, o Tab do navegador já faz a
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
  }, [onVoltar]);

  async function enviar() {
    setEnviando(true);
    await onEnviar({ estrelas, nps, comentario });
    setEnviada(true);
  }

  return (
    <div className="cortina">
      <div
        className="folha"
        ref={folhaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-avaliacao"
      >
        {enviada ? (
          <div className="obrigado">
            <div className="marca" aria-hidden="true">
              ✓
            </div>
            <h2 id="titulo-avaliacao">Obrigado!</h2>
            <p className="sub">Sua avaliação foi registrada. Pode fechar esta janela.</p>
          </div>
        ) : (
          <>
            <h2 id="titulo-avaliacao">Como foi sua experiência?</h2>
            <p className="sub">Sua opinião é o que nos ajuda a melhorar o assistente.</p>

            <div className="grupo">
              <label id="rotulo-estrelas">Que nota você dá para as respostas?</label>
              <div className="estrelas" role="group" aria-labelledby="rotulo-estrelas">
                {[1, 2, 3, 4, 5].map((valor) => (
                  <button
                    key={valor}
                    type="button"
                    aria-label={valor === 1 ? '1 estrela' : `${valor} estrelas`}
                    aria-pressed={estrelas === valor}
                    // Acende da primeira até a escolhida, como uma régua.
                    className={estrelas !== null && valor <= estrelas ? 'ativa' : ''}
                    onClick={() => setEstrelas(valor)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="grupo">
              <label id="rotulo-nps">O quanto você recomendaria este assistente?</label>
              <div className="nps" role="group" aria-labelledby="rotulo-nps">
                {Array.from({ length: 11 }, (_, valor) => (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={nps === valor}
                    className={nps === valor ? 'ativa' : ''}
                    onClick={() => setNps(valor)}
                  >
                    {valor}
                  </button>
                ))}
              </div>
              <div className="nps-legenda">
                <span>0 · Não recomendaria</span>
                <span>10 · Com certeza</span>
              </div>
            </div>

            <div className="grupo">
              <label htmlFor="comentario">Quer contar o porquê? (opcional)</label>
              <textarea
                id="comentario"
                maxLength={2000}
                placeholder="O que funcionou bem, o que faltou..."
                value={comentario}
                onChange={(evento) => setComentario(evento.target.value)}
              />
            </div>

            <div className="acoes">
              <button className="depois" type="button" onClick={onVoltar} disabled={enviando}>
                Voltar
              </button>
              <button
                className="enviar-avaliacao"
                type="button"
                onClick={enviar}
                disabled={enviando}
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
