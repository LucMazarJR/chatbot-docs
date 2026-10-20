'use client';

import { useCallback, useEffect, useState } from 'react';

import { guardarVozIaLigada, guardarVozNatural, lerVozIaLigada, lerVozNatural } from './leitura-em-voz';
import { vozDaLista, type NomeDaVoz } from './vozes';

export type EstadoDaVozIa = {
  /** Ainda perguntando ao servidor: o microfone segue o ditado enquanto isso. */
  carregando: boolean;
  /** O servidor transcreve áudio agora. */
  audio: boolean;
  /** O servidor fala com voz natural agora. Sem isso, a resposta usa a voz do celular. */
  vozNatural: boolean;
  motivo: 'sem-chave' | 'esgotada' | null;
};

/**
 * O que a voz por IA pode fazer agora neste aparelho: a escolha da pessoa em
 * Acessibilidade somada ao que o servidor diz que tem cota.
 *
 * Só no staging (`ativo`): no `/` nada é perguntado ao servidor.
 */
export function useVozIa(ativo: boolean) {
  const [ligada, setLigada] = useState(true);
  const [voz, setVoz] = useState<NomeDaVoz>(vozDaLista(null));
  const [estado, setEstado] = useState<EstadoDaVozIa>({ carregando: ativo, audio: false, vozNatural: false, motivo: null });

  // Lido depois de montar: no servidor não há `localStorage`, e decidir na
  // renderização faria o HTML do servidor divergir do da tela.
  useEffect(() => {
    setLigada(lerVozIaLigada());
    setVoz(vozDaLista(lerVozNatural()));
  }, []);

  const consultar = useCallback(async () => {
    if (!ativo) return;
    try {
      const resposta = await fetch('/api/voz/estado', { cache: 'no-store' });
      const dados = (await resposta.json()) as { audio?: boolean; vozNatural?: boolean; motivo?: 'sem-chave' | 'esgotada' };
      setEstado({ carregando: false, audio: Boolean(dados.audio), vozNatural: Boolean(dados.vozNatural), motivo: dados.motivo ?? null });
    } catch {
      // Sem resposta, vale o ditado: é o caminho que não depende do servidor.
      setEstado({ carregando: false, audio: false, vozNatural: false, motivo: null });
    }
  }, [ativo]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const mudarLigada = useCallback((nova: boolean) => {
    setLigada(nova);
    guardarVozIaLigada(nova);
  }, []);

  const mudarVoz = useCallback((nova: NomeDaVoz) => {
    setVoz(nova);
    guardarVozNatural(nova);
  }, []);

  return {
    ligada,
    voz,
    estado,
    /** Mandar a pergunta como áudio, no fluxo do WhatsApp. */
    fluxoDeAudio: ativo && ligada && estado.audio,
    /** Ouvir a resposta com voz natural. */
    falaNatural: ativo && ligada && estado.vozNatural,
    mudarLigada,
    mudarVoz,
    /** Pergunta de novo ao servidor: depois de uma recusa por cota, por exemplo. */
    consultar,
  };
}
