'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  bloqueioDaRecusa,
  bloqueiosDaSituacao,
  vigentes,
  type Bloqueio,
  type Bloqueios,
  type ParteDaVoz,
} from './bloqueio-da-voz';
import type { Entrada } from './escolhas-de-voz';
import { guardarEntrada, guardarVozEscolhida, lerEscolhas } from './leitura-em-voz';
import { VOZ_DO_CELULAR, VOZ_PADRAO, type EscolhaDeVoz, type NomeDaVoz } from './vozes';

/** O que a recusa do servidor traz: o motivo e até quando vale. */
export type RecusaDaVoz = { falha?: string; voltaEm?: string };

const CHAVE_BLOQUEIOS = 'pwa:voz-bloqueios';

/**
 * Guardados no aparelho: recarregar a página no meio do bloqueio não pode
 * fazer a próxima resposta tentar o servidor de novo só para ouvir a mesma
 * recusa. Os sem hora de volta (`ambiente`, `agora`) não são guardados: vêm
 * da situação do servidor a cada abertura.
 */
function lerBloqueiosGuardados(): Bloqueios {
  try {
    return vigentes(JSON.parse(localStorage.getItem(CHAVE_BLOQUEIOS) ?? '{}') as Bloqueios, Date.now());
  } catch {
    return {};
  }
}

function guardarBloqueios(bloqueios: Bloqueios): void {
  try {
    localStorage.setItem(CHAVE_BLOQUEIOS, JSON.stringify(bloqueios));
  } catch {
    // Vale para esta visita.
  }
}

/** O servidor diz que a parte está livre: o bloqueio do dia que o aparelho guardou não vale mais. */
function semOsDoDiaLivres(bloqueios: Bloqueios, livres: Record<ParteDaVoz, boolean>): Bloqueios {
  const restantes: Bloqueios = {};
  for (const parte of ['audio', 'vozNatural'] as const) {
    const bloqueio = bloqueios[parte];
    if (bloqueio && !(bloqueio.motivo === 'dia' && livres[parte])) restantes[parte] = bloqueio;
  }
  return restantes;
}

const SEM_CHAVE: Bloqueio = { ate: Infinity, motivo: 'ambiente' };
const SEM_RESPOSTA: Bloqueio = { ate: Infinity, motivo: 'agora' };

/**
 * As escolhas de voz da pessoa, somadas ao que a IA pode fazer agora.
 *
 * A escolha fica guardada mesmo com a parte bloqueada: a voz do celular assume
 * enquanto o bloqueio vale, e a escolha volta sozinha quando ele vence.
 *
 * Só com a voz ligada (`ativo`): sem ela, nada é perguntado ao servidor.
 */
export function useVozIa(ativo: boolean) {
  const [entrada, setEntrada] = useState<Entrada>('ia');
  const [voz, setVoz] = useState<EscolhaDeVoz>(VOZ_PADRAO);
  const [carregando, setCarregando] = useState(ativo);
  const [servidor, setServidor] = useState({ respondeu: false, audio: false, vozNatural: false, semChave: false });
  const [bloqueios, setBloqueios] = useState<Bloqueios>({});
  // O relógio da tela: muda quando um bloqueio vence, para a escolha voltar.
  const [agora, setAgora] = useState(() => Date.now());

  // Lido depois de montar: no servidor não há `localStorage`, e decidir na
  // renderização faria o HTML do servidor divergir do da tela.
  useEffect(() => {
    const escolhas = lerEscolhas();
    setEntrada(escolhas.entrada);
    setVoz(escolhas.voz);
    setBloqueios(lerBloqueiosGuardados());
  }, []);

  const consultar = useCallback(async () => {
    if (!ativo) return;
    try {
      const resposta = await fetch('/api/voz/estado', { cache: 'no-store' });
      const dados = (await resposta.json()) as { audio?: boolean; vozNatural?: boolean; motivo?: string; voltaEm?: string };
      const instante = Date.now();
      setServidor({
        respondeu: true,
        audio: Boolean(dados.audio),
        vozNatural: Boolean(dados.vozNatural),
        semChave: dados.motivo === 'sem-chave',
      });
      setBloqueios((atuais) => {
        const livres = { audio: Boolean(dados.audio), vozNatural: Boolean(dados.vozNatural) };
        const novos = { ...semOsDoDiaLivres(vigentes(atuais, instante), livres), ...bloqueiosDaSituacao(dados, instante) };
        guardarBloqueios(novos);
        return novos;
      });
    } catch {
      // Sem resposta, vale o celular: é o caminho que não depende do servidor.
      setServidor({ respondeu: false, audio: false, vozNatural: false, semChave: false });
    } finally {
      setCarregando(false);
      setAgora(Date.now());
    }
  }, [ativo]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const ativos = vigentes(bloqueios, agora);

  // Quando o bloqueio mais próximo vence, a tela se refaz e o servidor é
  // consultado: a escolha da pessoa volta sem ela precisar fazer nada.
  const proximoVencimento = Math.min(ativos.audio?.ate ?? Infinity, ativos.vozNatural?.ate ?? Infinity);
  useEffect(() => {
    if (!Number.isFinite(proximoVencimento)) return;
    const espera = Math.min(Math.max(proximoVencimento - Date.now(), 0) + 500, 2 ** 31 - 1);
    const relogio = setTimeout(() => {
      setAgora(Date.now());
      void consultar();
    }, espera);
    return () => clearTimeout(relogio);
  }, [proximoVencimento, consultar]);

  // O celular congela os relógios com a tela apagada: ao voltar, confere.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') setAgora(Date.now());
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const bloqueioDe = (parte: ParteDaVoz): Bloqueio | null => {
    if (!ativo || carregando) return null;
    if (servidor.semChave) return SEM_CHAVE;
    const bloqueio = ativos[parte];
    if (bloqueio) return bloqueio;
    if (!servidor.respondeu || !servidor[parte]) return SEM_RESPOSTA;
    return null;
  };
  const bloqueioDoAudio = bloqueioDe('audio');
  const bloqueioDaVozNatural = bloqueioDe('vozNatural');

  const bloquear = useCallback((parte: ParteDaVoz, bloqueio: Bloqueio) => {
    setBloqueios((atuais) => {
      const novos = { ...vigentes(atuais, Date.now()), [parte]: bloqueio };
      guardarBloqueios(novos);
      return novos;
    });
    setAgora(Date.now());
  }, []);

  /**
   * Uma recusa do servidor ao transcrever ou ao falar. Bloqueia a parte quando
   * a recusa diz até quando; devolve o bloqueio, ou `null`.
   */
  const registrarRecusa = useCallback(
    (parte: ParteDaVoz, recusa: RecusaDaVoz | null | undefined): Bloqueio | null => {
      const bloqueio = bloqueioDaRecusa(recusa, Date.now());
      if (bloqueio) bloquear(parte, bloqueio);
      else if (recusa?.falha === 'sem-chave') void consultar();
      return bloqueio;
    },
    [bloquear, consultar],
  );

  const mudarEntrada = useCallback((nova: Entrada) => {
    setEntrada(nova);
    guardarEntrada(nova);
  }, []);

  const mudarVoz = useCallback((nova: EscolhaDeVoz) => {
    setVoz(nova);
    guardarVozEscolhida(nova);
  }, []);

  const audioLivre = ativo && !carregando && !bloqueioDoAudio;
  const naturalLivre = ativo && !carregando && !bloqueioDaVozNatural;

  return {
    /** A escolha guardada de quem entende a fala. */
    entrada,
    /** A escolha guardada de quem fala as respostas. */
    voz,
    carregando,
    agora,
    bloqueioDoAudio,
    bloqueioDaVozNatural,
    /** Mandar a pergunta como áudio, no fluxo do WhatsApp. Senão, o microfone dita no campo. */
    fluxoDeAudio: audioLivre && entrada === 'ia',
    /** Ouvir a resposta com voz natural. Senão, a voz do celular. */
    falaNatural: naturalLivre && voz !== VOZ_DO_CELULAR,
    /** A voz natural a pedir ao servidor. */
    vozNatural: (voz === VOZ_DO_CELULAR ? VOZ_PADRAO : voz) as NomeDaVoz,
    mudarEntrada,
    mudarVoz,
    registrarRecusa,
    /** Pergunta de novo ao servidor. */
    consultar,
  };
}

export type VozIa = ReturnType<typeof useVozIa>;
