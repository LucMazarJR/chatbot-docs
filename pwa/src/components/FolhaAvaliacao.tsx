'use client';

import { useRef, useState } from 'react';

import { useFocoPreso } from '@/lib/usar-foco-preso';

type Props = {
  onEnviar: (avaliacao: {
    estrelas: number | null;
    nps: number | null;
    comentario: string;
  }) => Promise<void>;
  onVoltar: () => void;
  /**
   * A folha abriu sozinha, por tempo parado, e não pelo menu.
   *
   * Nesse caso ela se apresenta como convite: diz que é opcional, que enviar
   * encerra a conversa, e o botão de sair diz "Continuar conversando". No teste
   * de campo, a folha aberta sozinha foi lida como o fim obrigatório da
   * conversa, e a pessoa parou de perguntar.
   */
  automatica?: boolean;
};

/**
 * Folha de avaliação do fim da conversa.
 *
 * Três perguntas numa tela só: nota de satisfação, NPS e o campo aberto. Todas
 * opcionais: cobrar resposta de quem só queria encerrar a conversa é a melhor
 * forma de não receber nenhuma.
 */
export function FolhaAvaliacao({ onEnviar, onVoltar, automatica = false }: Props) {
  const [estrelas, setEstrelas] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const folhaRef = useRef<HTMLDivElement>(null);

  useFocoPreso(folhaRef, onVoltar);

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
            <h2 id="titulo-avaliacao">
              {automatica ? 'Quer avaliar a conversa?' : 'Como foi sua experiência?'}
            </h2>
            <p className="sub">
              {automatica
                ? 'É opcional. Se ainda tiver dúvidas, toque em Continuar conversando. Enviar a avaliação encerra esta conversa.'
                : 'Sua opinião é o que nos ajuda a melhorar o assistente. Enviar a avaliação encerra esta conversa.'}
            </p>

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
                {automatica ? 'Continuar conversando' : 'Voltar'}
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
