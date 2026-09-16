'use client';

import { useEffect, useRef, useState } from 'react';

import { cabecalhosDaSessao, esquecerSessao } from '@/lib/sessao-local';
import { useFocoPreso } from '@/lib/usar-foco-preso';

type Estado = 'confirmar' | 'apagando' | 'apagada' | 'erro';

/**
 * Confirmação antes de apagar a conversa.
 *
 * É o direito de exclusão da LGPD sem precisar pedir a ninguém. A confirmação
 * existe porque não há desfazer: a exclusão alcança também as cópias que a
 * curadoria guardou, e nada disso volta.
 *
 * Depois de apagada não existe conversa para onde voltar. O "voltar" e o Esc
 * passam a começar uma conversa nova — deixar a pessoa diante de um chat que
 * ainda mostra as mensagens apagadas faria parecer que a exclusão não funcionou.
 */
export function FolhaApagar({
  sessaoId,
  aoVoltar,
  esquecerNoAparelho = true,
}: {
  sessaoId: string;
  aoVoltar: () => void;
  /** Tirar a sessão do `localStorage` depois de apagar. Só faz sentido no chat anônimo. */
  esquecerNoAparelho?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>('confirmar');
  const folhaRef = useRef<HTMLDivElement>(null);
  const recomecarRef = useRef<HTMLButtonElement>(null);

  useFocoPreso(folhaRef, () => {
    if (estado === 'apagada') window.location.reload();
    else if (estado !== 'apagando') aoVoltar();
  });

  // O botão que tinha o foco ("Apagar") some da tela ao terminar; sem isto o
  // foco cairia no corpo da página, e o leitor de tela não anunciaria nada.
  useEffect(() => {
    if (estado === 'apagada') recomecarRef.current?.focus();
  }, [estado]);

  async function apagar() {
    setEstado('apagando');
    try {
      const resposta = await fetch(`/api/sessoes/${sessaoId}`, {
        method: 'DELETE',
        headers: cabecalhosDaSessao(),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      if (esquecerNoAparelho) esquecerSessao();
      setEstado('apagada');
    } catch {
      setEstado('erro');
    }
  }

  return (
    <div className="cortina">
      <div
        className="folha"
        ref={folhaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-apagar"
        aria-describedby="texto-apagar"
      >
        {estado === 'apagada' ? (
          <div className="obrigado">
            <div className="marca" aria-hidden="true">
              ✓
            </div>
            <h2 id="titulo-apagar">Conversa apagada</h2>
            <p className="sub" id="texto-apagar">
              As mensagens desta conversa foram apagadas, junto com as cópias usadas pela equipe
              para melhorar o assistente.
            </p>
            <div className="acoes">
              <button
                ref={recomecarRef}
                className="enviar-avaliacao"
                type="button"
                onClick={() => window.location.reload()}
              >
                Começar nova conversa
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="titulo-apagar">Apagar esta conversa?</h2>
            <p className="sub" id="texto-apagar">
              Todas as mensagens serão apagadas, junto com as cópias usadas pela equipe para
              melhorar o assistente. Não dá para desfazer.
            </p>

            {estado === 'erro' && (
              <p className="aviso-erro" role="alert">
                Não consegui apagar agora. A conversa continua aqui — tente de novo em instantes.
              </p>
            )}

            <div className="acoes">
              <button
                className="depois"
                type="button"
                onClick={aoVoltar}
                disabled={estado === 'apagando'}
              >
                Voltar
              </button>
              <button
                className="enviar-avaliacao perigo"
                type="button"
                onClick={apagar}
                disabled={estado === 'apagando'}
              >
                {estado === 'apagando' ? 'Apagando…' : 'Apagar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
