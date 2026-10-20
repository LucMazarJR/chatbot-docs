import type { ReactNode } from 'react';

import { renderizar } from '@/lib/wa-format';
import { TEXTO_DA_ETAPA, type EtapaDaResposta } from '@/lib/etapas-da-resposta';
import type { Papel } from '@/lib/tipos';

const TICK_SIMPLES = (
  <svg viewBox="0 0 16 15" aria-hidden="true">
    <path d="M10.9 3.3 5.8 10 3.1 7.6l-.7.8 3.5 3.1 5.8-7.6z" />
  </svg>
);

const TICK_DUPLO = (
  <svg viewBox="0 0 16 15" aria-hidden="true">
    <path d="M15.1 3.3 10 10 8.7 8.8l-.7.8 2 1.9 5.8-7.6zM10.4 3.3 5.3 10 2.6 7.6l-.7.8 3.5 3.1 5.8-7.6z" />
  </svg>
);

type Props = {
  papel: Papel;
  texto: string;
  hora: string;
  /** Primeiro balão de uma sequência do mesmo autor: é onde vai o rabinho. */
  primeira: boolean;
  /** Só nas mensagens do participante: dois tiques azuis quando a resposta chegou. */
  lida?: boolean;
  /**
   * O tocador do balão de áudio, acima do texto. Fica DENTRO do balão, como
   * no WhatsApp: controle solto embaixo da mensagem não parece parte dela.
   */
  acima?: ReactNode;
  /** Um controle pequeno no canto do balão, antes da hora: o alto-falante das respostas escritas. */
  canto?: ReactNode;
  /** O texto é a transcrição de um áudio: menor, abaixo do tocador. */
  transcricao?: boolean;
};

export function Balao({ papel, texto, hora, primeira, lida = false, acima, canto, transcricao = false }: Props) {
  const ehSaida = papel === 'user';

  return (
    <div
      className={['linha', ehSaida ? 'saida' : 'entrada-linha', primeira ? 'primeira' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={acima ? 'balao com-audio' : 'balao'}>
        {acima}
        <span
          className={transcricao ? 'texto transcricao' : 'texto'}
          // `renderizar` escapa o HTML antes de qualquer coisa, e as únicas tags
          // no resultado são as que ela mesma introduz. Nada que venha do modelo
          // (ou do participante) chega cru até aqui.
          // O espaço reservado no fim do texto cresce com o alto-falante, senão
          // a última linha passaria por baixo da hora.
          dangerouslySetInnerHTML={{
            __html: renderizar(texto) + `<span class="espaco-meta${canto ? ' com-canto' : ''}"></span>`,
          }}
        />

        <span className={'meta' + (lida ? ' lido' : '')}>
          {canto}
          <span>{hora}</span>
          {/* Os tiques são a única indicação de que a mensagem chegou, e são
              desenho puro: para quem usa leitor de tela, um tique e dois tiques
              azuis eram exatamente a mesma coisa: nada. */}
          {ehSaida ? (
            <>
              <span className="sr-only">{lida ? 'Entregue' : 'Enviando'}</span>
              {lida ? TICK_DUPLO : TICK_SIMPLES}
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** O desenho de cada etapa, que se mexe devagar enquanto ela dura (ver `.etapa-*` no CSS). */
const ICONES_DA_ETAPA: Record<EtapaDaResposta, ReactNode> = {
  entendendo: (
    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM6 9h12v2H6V9Zm8 5H6v-2h8v2Zm4-6H6V6h12v2Z" />
  ),
  buscando: (
    <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z" />
  ),
  escrevendo: (
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
  ),
};

/**
 * O balão de "digitando". No staging, com a etapa da resposta: um ícone que
 * se mexe e uma frase curta, ao lado dos três pontos. Três pontos parados por
 * 40 s pareciam travamento; a etapa diz que a resposta está andando, sem
 * ocupar mais que o próprio balão.
 */
export function Digitando({ etapa = null }: { etapa?: EtapaDaResposta | null }) {
  return (
    // `aria-hidden`: quem anuncia a espera é o "digitando…" do cabeçalho, que
    // é role="status". Sem isto os dois falariam, e o leitor de tela repetiria
    // o aviso a cada repintura da lista.
    <div className="linha entrada-linha digitando" aria-hidden="true">
      <div className={etapa ? 'balao com-etapa' : 'balao'}>
        {/* A chave muda com a etapa: o trecho é refeito, e a frase nova entra
            deslizando, em vez de trocar seca. */}
        {etapa && (
          <span key={etapa} className={`etapa etapa-${etapa}`}>
            <svg viewBox="0 0 24 24">{ICONES_DA_ETAPA[etapa]}</svg>
            <span>{TEXTO_DA_ETAPA[etapa]}</span>
          </span>
        )}
        <div className="pontos">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
