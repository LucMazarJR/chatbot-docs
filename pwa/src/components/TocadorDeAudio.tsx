'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { falar, pararDeFalar, taxaDeReproducao, vozSuportada } from '@/lib/leitura-em-voz';
import { aindaEAVez, soltarAVez, tomarAVez } from '@/lib/som-unico';
import { formatarDuracao } from '@/lib/usar-gravador';
import type { RecusaDaVoz } from '@/lib/usar-voz-ia';

/**
 * O que o tocador toca.
 *
 * `gravacao`: o áudio que a própria pessoa gravou, guardado só no aparelho.
 * `resposta`: a resposta do bot, falada com voz natural (o servidor gera o
 * MP3) quando `natural` está ligado, ou pela voz do celular.
 */
export type FonteDoAudio =
  | { tipo: 'gravacao'; url: string }
  | { tipo: 'resposta'; mensagemId: string; texto: string; natural: boolean; voz: string };

type Estado = 'parado' | 'preparando' | 'tocando' | 'pausado' | 'aparelho';

/**
 * O MP3 de cada resposta, por voz, enquanto a página está aberta.
 *
 * A promessa fica guardada, e não só o resultado: a resposta é preparada assim
 * que chega, e o toque em play que vem logo depois espera a mesma chamada em
 * vez de abrir outra. Cada chamada gasta uma das poucas falas gratuitas do dia.
 */
const preparados = new Map<string, Promise<{ url: string } | ({ erro: string } & RecusaDaVoz)>>();

function prepararResposta(mensagemId: string, voz: string) {
  const chave = `${mensagemId}:${voz}`;
  let pronto = preparados.get(chave);
  if (!pronto) {
    pronto = fetch(`/api/mensagens/${mensagemId}/voz?voz=${encodeURIComponent(voz)}`)
      .then(async (resposta) => {
        if (resposta.ok) return { url: URL.createObjectURL(await resposta.blob()) };
        const dados = (await resposta.json().catch(() => ({}))) as { erro?: string } & RecusaDaVoz;
        return {
          erro: dados.erro ?? 'Não consegui gerar a voz natural agora. Uso a voz do celular.',
          falha: dados.falha ?? 'falha',
          voltaEm: dados.voltaEm,
        };
      })
      .catch(() => ({ erro: 'Sem conexão para a voz natural. Uso a voz do celular.', falha: 'falha' }));
    pronto.then((r) => 'erro' in r && preparados.delete(chave));
    preparados.set(chave, pronto);
  }
  return pronto;
}

const ICONE_PLAY = <path d="M8 5v14l11-7z" />;
const ICONE_PAUSA = <path d="M6 5h4v14H6zM14 5h4v14h-4z" />;
const ICONE_ALTO_FALANTE = (
  <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12ZM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77Z" />
);

export function TocadorDeAudio({
  fonte,
  duracao,
  canto = false,
  preparar = false,
  tocarAgora = false,
  aoAvisar,
  aoRecusa,
  aoOuvirNoCelular,
}: {
  fonte: FonteDoAudio;
  /** Duração já conhecida, em segundos (a da gravação). A da voz natural vem do próprio áudio. */
  duracao?: number;
  /**
   * O alto-falante no canto da resposta escrita, ao lado da hora, em vez do
   * tocador do balão de áudio. O botão "Ouvir" de antes, com borda, embaixo do
   * texto, não se parecia com nada do WhatsApp; ali só cabem a hora e os
   * tiques, e o alto-falante entra discreto como eles.
   */
  canto?: boolean;
  /** Já prepara a voz natural ao aparecer: a resposta a um áudio é áudio, e a pessoa não espera no play. */
  preparar?: boolean;
  /** Toca assim que estiver pronto: "ler as respostas sozinho". */
  tocarAgora?: boolean;
  aoAvisar: (aviso: string) => void;
  /** O servidor recusou a voz natural: quem chama decide se bloqueia (ver `usar-voz-ia.ts`). */
  aoRecusa?: (recusa: RecusaDaVoz) => void;
  /** A resposta tocou na voz do celular: registro para comparar com a natural. */
  aoOuvirNoCelular?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [estado, setEstado] = useState<Estado>('parado');
  const [tempo, setTempo] = useState(0);
  const [total, setTotal] = useState(duracao ?? 0);
  // O MP3 da voz natural já carregado, com a voz em que foi gerado: trocar a
  // voz em Acessibilidade faz o próximo play buscar a voz nova.
  const urlRef = useRef<{ voz: string; url: string } | null>(null);
  const urlPronta = () => (fonte.tipo === 'resposta' && urlRef.current?.voz === fonte.voz ? urlRef.current.url : null);
  const tocouSozinhoRef = useRef(false);
  // Em ref, e não lido do estado: o "parar" é chamado por OUTRO tocador, que
  // guardou a função de uma renderização antiga.
  const estadoRef = useRef<Estado>('parado');
  estadoRef.current = estado;
  /** A vez deste tocador no som único (lib/som-unico.ts), enquanto ele toca ou prepara. */
  const vezRef = useRef<number | null>(null);

  // Chamado também por OUTRO som que tomou a vez: inclusive no meio do
  // preparo, que então termina sem tocar.
  const parar = useCallback(() => {
    audioRef.current?.pause();
    if (estadoRef.current === 'aparelho') pararDeFalar();
    setEstado((atual) =>
      atual === 'tocando' ? 'pausado' : atual === 'aparelho' || atual === 'preparando' ? 'parado' : atual,
    );
  }, []);

  /** A pessoa tocou em pausa: a vez fica livre. */
  function pausar() {
    if (vezRef.current !== null) soltarAVez(vezRef.current);
    parar();
  }

  useEffect(() => () => {
    audioRef.current?.pause();
    if (vezRef.current !== null) soltarAVez(vezRef.current);
  }, []);

  /** Garante o elemento de áudio com a fonte certa. */
  const elemento = useCallback((url: string) => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.addEventListener('timeupdate', () => setTempo(audio.currentTime));
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration)) setTotal(audio.duration);
      });
      audio.addEventListener('ended', () => {
        if (vezRef.current !== null) soltarAVez(vezRef.current);
        setEstado('parado');
        setTempo(0);
      });
      audioRef.current = audio;
    }
    if (audioRef.current.src !== url) audioRef.current.src = url;
    return audioRef.current;
  }, []);

  async function falarNoAparelho(vez: number) {
    if (fonte.tipo !== 'resposta') return;
    if (!vozSuportada()) {
      aoAvisar('Este navegador não lê respostas em voz alta.');
      setEstado('parado');
      return;
    }
    setEstado('aparelho');
    const conseguiu = await falar(fonte.texto, () => {
      soltarAVez(vez);
      setEstado('parado');
    });
    if (!conseguiu) {
      setEstado('parado');
      aoAvisar('Este aparelho não tem voz em português instalada. Dá para instalar nas configurações de voz do celular.');
      return;
    }
    aoOuvirNoCelular?.();
  }

  /** O endereço do MP3 da voz natural, ou nulo para usar a voz do celular. */
  async function urlDaVozNatural(avisar: boolean): Promise<string | null> {
    if (fonte.tipo !== 'resposta' || !fonte.natural) return null;
    const pronta = urlPronta();
    if (pronta) return pronta;
    const resultado = await prepararResposta(fonte.mensagemId, fonte.voz);
    if ('url' in resultado) {
      urlRef.current = { voz: fonte.voz, url: resultado.url };
      elemento(resultado.url);
      return resultado.url;
    }
    aoRecusa?.(resultado);
    if (avisar) aoAvisar(resultado.erro);
    return null;
  }

  async function tocar() {
    const vez = tomarAVez(parar);
    vezRef.current = vez;

    if (fonte.tipo === 'gravacao') {
      const audio = elemento(fonte.url);
      audio.playbackRate = 1;
      await audio.play().catch(() => {});
      setEstado('tocando');
      return;
    }

    if (!urlPronta() && fonte.natural) setEstado('preparando');
    const url = await urlDaVozNatural(true);
    // A pessoa tocou em outro áudio enquanto este chegava: ele fica pronto
    // para o próximo play, mas não toca junto com o outro.
    if (!aindaEAVez(vez)) return;
    if (!url) {
      await falarNoAparelho(vez);
      return;
    }
    const audio = elemento(url);
    audio.playbackRate = taxaDeReproducao();
    try {
      await audio.play();
      setEstado('tocando');
    } catch {
      // O navegador barrou o play sem toque (a leitura automática): fica
      // pronto, esperando o toque da pessoa.
      setEstado('parado');
    }
  }

  // Resposta a um áudio: já prepara a voz natural, e toca sozinha se a pessoa
  // pediu para ouvir as respostas assim que chegam.
  useEffect(() => {
    if (fonte.tipo !== 'resposta') return;
    if (tocarAgora && !tocouSozinhoRef.current) {
      tocouSozinhoRef.current = true;
      void tocar();
      return;
    }
    if (preparar && fonte.natural && !urlPronta()) {
      setEstado('preparando');
      void urlDaVozNatural(false).then(() => setEstado((atual) => (atual === 'preparando' ? 'parado' : atual)));
    }
    // Uma vez por resposta: a fonte não muda depois de o balão aparecer.
  }, []);

  const tocando = estado === 'tocando' || estado === 'aparelho';
  const rotulo =
    estado === 'preparando'
      ? 'Preparando o áudio'
      : tocando
        ? 'Pausar'
        : fonte.tipo === 'gravacao'
          ? 'Ouvir o seu áudio'
          : 'Ouvir a resposta';

  if (canto) {
    return (
      <button
        type="button"
        className={'ouvir-canto' + (tocando ? ' tocando' : '')}
        aria-label={rotulo}
        aria-pressed={tocando}
        disabled={estado === 'preparando'}
        onClick={() => (tocando ? pausar() : void tocar())}
      >
        {estado === 'preparando' ? (
          <span className="giro-pequeno" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {tocando ? ICONE_PAUSA : ICONE_ALTO_FALANTE}
          </svg>
        )}
        {/* O tempo corrido, como no áudio do WhatsApp. A voz do celular não
            diz quanto falta, então ali fica só a pausa. */}
        {estado === 'tocando' && (
          <span className="ouvir-canto-tempo" aria-hidden="true">
            {formatarDuracao(Math.round(tempo))}
          </span>
        )}
      </button>
    );
  }

  const comBarra = estado !== 'aparelho' && total > 0;
  return (
    <div className="tocador">
      <button
        type="button"
        className="tocador-play"
        aria-label={rotulo}
        disabled={estado === 'preparando'}
        onClick={() => (tocando ? pausar() : void tocar())}
      >
        {estado === 'preparando' ? (
          <span className="giro-pequeno" aria-hidden="true" />
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {tocando ? ICONE_PAUSA : ICONE_PLAY}
          </svg>
        )}
      </button>
      <div className="tocador-meio">
        {comBarra ? (
          <input
            type="range"
            className="tocador-barra"
            aria-label="Posição do áudio"
            min={0}
            max={total}
            step={0.1}
            value={Math.min(tempo, total)}
            onChange={(evento) => {
              const audio = audioRef.current;
              if (audio) audio.currentTime = Number(evento.target.value);
              setTempo(Number(evento.target.value));
            }}
          />
        ) : (
          <span className="tocador-onda" aria-hidden="true" />
        )}
        <span className="tocador-tempo" role={estado === 'preparando' ? 'status' : undefined}>
          {estado === 'preparando'
            ? 'Preparando o áudio…'
            : estado === 'aparelho'
              ? 'Voz do celular'
              : formatarDuracao(Math.round(tocando || estado === 'pausado' ? tempo : total))}
        </span>
      </div>
    </div>
  );
}

/** O balão de áudio depois de recarregar a página: a gravação ficou no aparelho e já não existe. */
export function AudioSemGravacao({ duracao }: { duracao: number }) {
  return (
    <div className="tocador sem-gravacao">
      <span className="tocador-play" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
        </svg>
      </span>
      <div className="tocador-meio">
        <span className="tocador-onda" aria-hidden="true" />
        <span className="tocador-tempo">
          <span className="sr-only">Áudio de </span>
          {formatarDuracao(duracao)}
        </span>
      </div>
    </div>
  );
}
