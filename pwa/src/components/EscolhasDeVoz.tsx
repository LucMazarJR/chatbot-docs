'use client';

import { useEffect, useRef, useState } from 'react';

import { explicarBloqueio, type Bloqueio } from '@/lib/bloqueio-da-voz';
import type { Entrada } from '@/lib/escolhas-de-voz';
import { falar, pararDeFalar, taxaDeReproducao } from '@/lib/leitura-em-voz';
import { soltarAVez, tomarAVez } from '@/lib/som-unico';
import type { VozIa } from '@/lib/usar-voz-ia';
import { FRASE_DA_AMOSTRA, rotuloDaVoz, VOZ_DO_CELULAR, VOZES, type EscolhaDeVoz } from '@/lib/vozes';

const ICONE_RELOGIO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7Z" />
  </svg>
);

const ICONE_TOCANDO = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12ZM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77Z" />
  </svg>
);

/**
 * Uma opção de rádio que pode estar bloqueada.
 *
 * Bloqueada, ela fica apagada, com um relógio, e o motivo escrito embaixo,
 * sempre à vista: no celular não existe passar o mouse por cima, e um botão
 * apagado sem explicação é o que o CLAUDE.md proíbe. Tocar nela não troca nada
 * e repete o motivo para o leitor de tela.
 */
function Opcao({
  id,
  escolhida,
  rotulo,
  descricao,
  bloqueio,
  agora,
  aoEscolher,
  aoTocarBloqueada,
  extra,
  motivoNoTopo,
}: {
  id: string;
  escolhida: boolean;
  rotulo: string;
  descricao: string;
  bloqueio: Bloqueio | null;
  agora: number;
  aoEscolher: () => void;
  aoTocarBloqueada: (motivo: string) => void;
  /** À direita: "tocando", ou o que a opção faz agora. */
  extra?: React.ReactNode;
  /**
   * O id de um motivo escrito uma vez só, acima do grupo: as seis vozes
   * naturais acabam juntas, e o mesmo motivo repetido seis vezes enchia a
   * lista de texto igual.
   */
  motivoNoTopo?: string;
}) {
  const motivo = bloqueio ? explicarBloqueio(bloqueio, agora) : null;
  const idDoMotivo = motivoNoTopo ?? `motivo-${id}`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={escolhida}
      aria-disabled={bloqueio ? true : undefined}
      aria-describedby={motivo ? idDoMotivo : undefined}
      className={[escolhida ? 'escolhido' : '', bloqueio ? 'bloqueada' : ''].filter(Boolean).join(' ')}
      onClick={() => (motivo ? aoTocarBloqueada(motivo) : aoEscolher())}
    >
      <span className="marcador" aria-hidden="true" />
      <span className="opcao-texto">
        <strong>{rotulo}</strong>
        <small>{descricao}</small>
        {motivo && !motivoNoTopo && (
          <small className="motivo-bloqueio" id={idDoMotivo}>
            {ICONE_RELOGIO}
            {motivo}
          </small>
        )}
      </span>
      {extra}
    </button>
  );
}

/** Quem entende a fala, e a linha que abre a escolha da voz das respostas. */
/** Repetir o mesmo texto não seria lido de novo: o espaço no fim muda o texto. */
function useAnuncio() {
  const [anuncio, setAnuncio] = useState('');
  const anunciar = (texto: string) => setAnuncio((atual) => (atual === texto ? `${texto} ` : texto));
  return [anuncio, anunciar] as const;
}

export function SecaoDeVoz({ vozIa, aoEscolherVoz }: { vozIa: VozIa; aoEscolherVoz: () => void }) {
  const [anuncio, anunciar] = useAnuncio();
  const audioBloqueado = vozIa.bloqueioDoAudio;
  // Com a IA bloqueada, quem entende é o celular, mesmo com a escolha na IA.
  const entradaEmUso: Entrada = audioBloqueado ? 'celular' : vozIa.entrada;
  const naturalBloqueada = vozIa.bloqueioDaVozNatural;
  const vozEmUso: EscolhaDeVoz = naturalBloqueada ? VOZ_DO_CELULAR : vozIa.voz;

  return (
    <>
      <section className="painel-secao">
        <h3 id="rotulo-entrada">Quando você fala</h3>
        <div role="radiogroup" aria-labelledby="rotulo-entrada" className="opcoes-tema">
          <Opcao
            id="entrada-ia"
            escolhida={entradaEmUso === 'ia'}
            rotulo="A IA entende o seu áudio"
            descricao="Você manda áudio, como no WhatsApp, e a resposta vem em áudio"
            bloqueio={audioBloqueado}
            agora={vozIa.agora}
            aoEscolher={() => vozIa.mudarEntrada('ia')}
            aoTocarBloqueada={anunciar}
          />
          <Opcao
            id="entrada-celular"
            escolhida={entradaEmUso === 'celular'}
            rotulo="O celular escreve"
            descricao={
              audioBloqueado && vozIa.entrada === 'ia'
                ? 'Em uso até a IA voltar. O que você fala vira texto no campo'
                : 'O que você fala vira texto no campo, para conferir e enviar'
            }
            bloqueio={null}
            agora={vozIa.agora}
            aoEscolher={() => vozIa.mudarEntrada('celular')}
            aoTocarBloqueada={anunciar}
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </section>

      <section className="painel-secao">
        <h3 id="rotulo-voz-respostas">Voz das respostas</h3>
        {/* Uma linha que abre a lista, como o toque do celular nas
            configurações: as sete vozes aqui deixavam o painel comprido, e a
            letra e o contraste sumiam para cima. */}
        <button type="button" className="linha-escolha" aria-labelledby="rotulo-voz-respostas valor-voz-respostas" onClick={aoEscolherVoz}>
          <span className="opcao-texto" id="valor-voz-respostas">
            <strong>{rotuloDaVoz(vozEmUso)}</strong>
            <small>
              {naturalBloqueada && vozIa.voz !== VOZ_DO_CELULAR
                ? `Até a voz natural voltar. ${explicarBloqueio(naturalBloqueada, vozIa.agora)}`
                : vozEmUso === VOZ_DO_CELULAR
                  ? 'Robótica, sem custo e sem limite'
                  : 'Voz natural, por IA'}
            </small>
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.3 6.7 10.7 5.3 17.4 12l-6.7 6.7-1.4-1.4 5.3-5.3-5.3-5.3Z" />
          </svg>
        </button>
      </section>
    </>
  );
}

/**
 * A lista das vozes das respostas, numa tela própria dentro do painel.
 *
 * Tocar numa voz escolhe e toca a amostra, como escolher o toque do celular.
 * Era um botão "Ouvir" ao lado de cada opção, e a lista parecia uma tabela de
 * botões; e quem tocava no nome escolhia sem ouvir. As amostras naturais são
 * arquivos fixos (public/vozes): ouvir as seis não gasta cota.
 */
export function TelaDaVozDasRespostas({ vozIa, aoVoltar }: { vozIa: VozIa; aoVoltar: () => void }) {
  const [tocando, setTocando] = useState<EscolhaDeVoz | null>(null);
  const [anuncio, anunciar] = useAnuncio();
  const amostraRef = useRef<{ parar: () => void; vez: number } | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const naturalBloqueada = vozIa.bloqueioDaVozNatural;
  const vozEmUso: EscolhaDeVoz = naturalBloqueada ? VOZ_DO_CELULAR : vozIa.voz;

  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  function pararAmostra() {
    const amostra = amostraRef.current;
    amostraRef.current = null;
    if (!amostra) return;
    amostra.parar();
    soltarAVez(amostra.vez);
    setTocando(null);
  }

  // Sair da lista cala a amostra: ela não teria mais onde ser parada.
  useEffect(() => pararAmostra, []);

  function tocarAmostra(voz: EscolhaDeVoz) {
    const repetiu = tocando === voz;
    pararAmostra();
    if (repetiu) return;

    const terminou = (vez: number) => {
      soltarAVez(vez);
      amostraRef.current = null;
      setTocando((atual) => (atual === voz ? null : atual));
    };

    if (voz === VOZ_DO_CELULAR) {
      const vez = tomarAVez(() => {
        pararDeFalar();
        setTocando(null);
      });
      amostraRef.current = { parar: pararDeFalar, vez };
      setTocando(voz);
      void falar(FRASE_DA_AMOSTRA, () => terminou(vez)).then((conseguiu) => {
        if (conseguiu) return;
        terminou(vez);
        anunciar('Este aparelho não tem voz em português instalada. Dá para instalar nas configurações de voz do celular.');
      });
      return;
    }

    const audio = new Audio(`/vozes/${voz}.mp3`);
    audio.playbackRate = taxaDeReproducao();
    // A amostra para a resposta que estiver tocando na conversa, e o
    // contrário também: duas vozes juntas não deixam comparar nenhuma.
    const vez = tomarAVez(() => {
      audio.pause();
      setTocando(null);
    });
    amostraRef.current = { parar: () => audio.pause(), vez };
    audio.addEventListener('ended', () => terminou(vez));
    setTocando(voz);
    void audio.play().catch(() => terminou(vez));
  }

  function escolher(voz: EscolhaDeVoz) {
    vozIa.mudarVoz(voz);
    tocarAmostra(voz);
  }

  const indicador = (voz: EscolhaDeVoz) =>
    tocando === voz ? (
      <span className="opcao-tocando">
        {ICONE_TOCANDO}
        <span className="sr-only">tocando a amostra</span>
      </span>
    ) : null;

  return (
    <>
      <header className="painel-topo">
        <button type="button" aria-label="Voltar para Letra e voz" onClick={aoVoltar}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z" />
          </svg>
        </button>
        <h2 id="titulo-ajustes" ref={tituloRef} tabIndex={-1}>
          Voz das respostas
        </h2>
      </header>

      <div className="painel-corpo">
        <section className="painel-secao">
          <p className="painel-sobre">Toque numa voz para ouvir como ela fala. A que você tocar por último fica escolhida.</p>
          {naturalBloqueada && (
            <p className="motivo-bloqueio motivo-do-grupo" id="motivo-vozes-naturais">
              {ICONE_RELOGIO}
              <span>
                <b>Vozes naturais:</b> {explicarBloqueio(naturalBloqueada, vozIa.agora)}
              </span>
            </p>
          )}
          <div role="radiogroup" aria-labelledby="titulo-ajustes" className="opcoes-tema opcoes-voz">
            {VOZES.map((voz) => (
              <Opcao
                key={voz.nome}
                id={`voz-${voz.nome}`}
                escolhida={vozEmUso === voz.nome}
                rotulo={voz.descricao}
                descricao={vozIa.voz === voz.nome && naturalBloqueada ? 'Voz natural. É a sua escolha, e volta sozinha' : 'Voz natural, por IA'}
                bloqueio={naturalBloqueada}
                motivoNoTopo="motivo-vozes-naturais"
                agora={vozIa.agora}
                aoEscolher={() => escolher(voz.nome)}
                aoTocarBloqueada={anunciar}
                extra={indicador(voz.nome)}
              />
            ))}
            <Opcao
              id="voz-celular"
              escolhida={vozEmUso === VOZ_DO_CELULAR}
              rotulo="Do celular"
              descricao={
                naturalBloqueada && vozIa.voz !== VOZ_DO_CELULAR
                  ? 'Em uso até a voz natural voltar. Robótica, sem custo e sem limite'
                  : 'Robótica, sem custo e sem limite. Funciona sem internet'
              }
              bloqueio={null}
              agora={vozIa.agora}
              aoEscolher={() => escolher(VOZ_DO_CELULAR)}
              aoTocarBloqueada={anunciar}
              extra={indicador(VOZ_DO_CELULAR)}
            />
          </div>
          <p className="sr-only" aria-live="polite">
            {anuncio}
          </p>
        </section>
      </div>
    </>
  );
}
