'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { falar, pararDeFalar, taxaDeReproducao, vozSuportada } from '@/lib/leitura-em-voz';
import { formatarDuracao } from '@/lib/usar-gravador';

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
const preparados = new Map<string, Promise<{ url: string } | { erro: string; falha: string }>>();

function prepararResposta(mensagemId: string, voz: string) {
  const chave = `${mensagemId}:${voz}`;
  let pronto = preparados.get(chave);
  if (!pronto) {
    pronto = fetch(`/api/mensagens/${mensagemId}/voz?voz=${encodeURIComponent(voz)}`)
      .then(async (resposta) => {
        if (resposta.ok) return { url: URL.createObjectURL(await resposta.blob()) };
        const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; falha?: string };
        return { erro: dados.erro ?? 'Não consegui gerar a voz natural agora. Uso a voz do celular.', falha: dados.falha ?? 'falha' };
      })
      .catch(() => ({ erro: 'Sem conexão para a voz natural. Uso a voz do celular.', falha: 'falha' }));
    pronto.then((r) => 'erro' in r && preparados.delete(chave));
    preparados.set(chave, pronto);
  }
  return pronto;
}

/** Um áudio por vez, como no WhatsApp: o play de um para o que estiver tocando. */
let pararOAnterior: (() => void) | null = null;

const ICONE_PLAY = <path d="M8 5v14l11-7z" />;
const ICONE_PAUSA = <path d="M6 5h4v14H6zM14 5h4v14h-4z" />;

export function TocadorDeAudio({
  fonte,
  duracao,
  compacto = false,
  preparar = false,
  tocarAgora = false,
  aoAvisar,
  aoCotaAcabar,
}: {
  fonte: FonteDoAudio;
  /** Duração já conhecida, em segundos (a da gravação). A da voz natural vem do próprio áudio. */
  duracao?: number;
  /** O "Ouvir" pequeno das respostas a texto, em vez do tocador do balão de áudio. */
  compacto?: boolean;
  /** Já prepara a voz natural ao aparecer: a resposta a um áudio é áudio, e a pessoa não espera no play. */
  preparar?: boolean;
  /** Toca assim que estiver pronto: "ler as respostas sozinho". */
  tocarAgora?: boolean;
  aoAvisar: (aviso: string) => void;
  aoCotaAcabar?: () => void;
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

  const parar = useCallback(() => {
    audioRef.current?.pause();
    if (estadoRef.current === 'aparelho') pararDeFalar();
    setEstado((atual) => (atual === 'tocando' ? 'pausado' : atual === 'aparelho' ? 'parado' : atual));
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
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
        setEstado('parado');
        setTempo(0);
      });
      audioRef.current = audio;
    }
    if (audioRef.current.src !== url) audioRef.current.src = url;
    return audioRef.current;
  }, []);

  async function falarNoAparelho() {
    if (fonte.tipo !== 'resposta') return;
    if (!vozSuportada()) {
      aoAvisar('Este navegador não lê respostas em voz alta.');
      setEstado('parado');
      return;
    }
    setEstado('aparelho');
    const conseguiu = await falar(fonte.texto, () => setEstado('parado'));
    if (!conseguiu) {
      setEstado('parado');
      aoAvisar('Este aparelho não tem voz em português instalada. Dá para instalar nas configurações de voz do celular.');
    }
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
    if (resultado.falha === 'esgotada' || resultado.falha === 'cota' || resultado.falha === 'sem-chave') aoCotaAcabar?.();
    if (avisar) aoAvisar(resultado.erro);
    return null;
  }

  async function tocar() {
    pararOAnterior?.();
    pararOAnterior = parar;

    if (fonte.tipo === 'gravacao') {
      const audio = elemento(fonte.url);
      audio.playbackRate = 1;
      await audio.play().catch(() => {});
      setEstado('tocando');
      return;
    }

    if (!urlPronta() && fonte.natural) setEstado('preparando');
    const url = await urlDaVozNatural(true);
    if (!url) {
      await falarNoAparelho();
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

  if (compacto) {
    return (
      <button
        type="button"
        className={'ouvir-compacto' + (tocando ? ' tocando' : '')}
        aria-label={rotulo}
        aria-pressed={tocando}
        disabled={estado === 'preparando'}
        onClick={() => (tocando ? parar() : void tocar())}
      >
        {estado === 'preparando' ? (
          <span className="giro-pequeno" aria-hidden="true" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {tocando ? ICONE_PAUSA : ICONE_PLAY}
          </svg>
        )}
        {estado === 'preparando' ? 'Preparando…' : tocando ? 'Pausar' : 'Ouvir'}
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
        onClick={() => (tocando ? parar() : void tocar())}
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
