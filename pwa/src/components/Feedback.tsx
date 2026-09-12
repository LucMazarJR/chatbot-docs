'use client';

import { useState } from 'react';

import { cabecalhosDaSessao } from '@/lib/sessao-local';
import type { Voto } from '@/lib/tipos';

/**
 * Polegares sob cada resposta do bot.
 *
 * É o dado que mais ajuda a calibrar o RAG: saber QUAL resposta foi ruim, e não
 * só que a conversa foi ruim. Cruzado com os scores dos trechos na tela de
 * revisão, é o que permite ajustar o limiar de 0.82 com base em uso real.
 */
export function Feedback({ mensagemId }: { mensagemId: string }) {
  const [escolhido, setEscolhido] = useState<Voto | null>(null);

  function votar(voto: Voto) {
    setEscolhido(voto);
    // Sem await e sem tratar erro na tela: um voto perdido não pode interromper
    // a conversa que está sendo avaliada.
    fetch(`/api/mensagens/${mensagemId}/feedback`, {
      method: 'POST',
      headers: cabecalhosDaSessao({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ voto }),
    }).catch(() => {});
  }

  return (
    <div className={'avaliar-msg' + (escolhido ? ' respondido' : '')}>
      {(
        [
          ['up', '👍', 'Esta resposta ajudou'],
          ['down', '👎', 'Esta resposta não ajudou'],
        ] as const
      ).map(([voto, rotulo, titulo]) => (
        <button
          key={voto}
          type="button"
          title={titulo}
          aria-label={titulo}
          className={escolhido === voto ? 'escolhido' : ''}
          onClick={() => votar(voto)}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
