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
};

export function Balao({ papel, texto, hora, primeira, lida = false }: Props) {
  const ehSaida = papel === 'user';

  return (
    <div
      className={['linha', ehSaida ? 'saida' : 'entrada-linha', primeira ? 'primeira' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="balao">
        <span
          className="texto"
          // `renderizar` escapa o HTML antes de qualquer coisa, e as únicas tags
          // no resultado são as que ela mesma introduz. Nada que venha do modelo
          // (ou do participante) chega cru até aqui.
          dangerouslySetInnerHTML={{ __html: renderizar(texto) + '<span class="espaco-meta"></span>' }}
        />

        <span className={'meta' + (lida ? ' lido' : '')}>
          <span>{hora}</span>
          {ehSaida ? (lida ? TICK_DUPLO : TICK_SIMPLES) : null}
        </span>
      </div>
    </div>
  );
}

export function Digitando() {
  return (
    <div className="linha entrada-linha digitando">
      <div className="balao">
        <div className="pontos" aria-label="digitando">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
