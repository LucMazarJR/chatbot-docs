import type { ReactNode } from 'react';

import { renderizar } from '@/lib/wa-format';
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

export function Digitando() {
  return (
    // `aria-hidden`: quem anuncia a espera é o "digitando…" do cabeçalho, que
    // é role="status". Sem isto os dois falariam, e o leitor de tela repetiria
    // o aviso a cada repintura da lista.
    <div className="linha entrada-linha digitando" aria-hidden="true">
      <div className="balao">
        <div className="pontos">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
