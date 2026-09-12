'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Opcoes = {
  /** Chamado ao parar, com a duração do que foi gravado. */
  aoTerminar: (duracaoSegundos: number, mime: string) => void;
  aoFalhar: (aviso: string) => void;
};

/** Teto de segurança: ninguém grava 20 minutos de propósito. */
const MAXIMO_SEGUNDOS = 120;

/**
 * Gravação de áudio pelo microfone.
 *
 * LÓGICA DO LUCIANO: o áudio é gravado e NÃO é enviado. Isso não é preguiça — o
 * fluxo não tem transcrição, então o arquivo não teria para onde ir, e guardar
 * voz de gente relatando problema de saúde seria acumular dado sensível sem
 * nenhum uso. O que sai daqui é a duração, e o que a validação aprende é quanta
 * gente prefere falar a digitar.
 *
 * O `stream.getTracks().stop()` no fim não é detalhe: sem ele o indicador de
 * microfone do celular fica aceso depois da gravação, e o aparelho continua
 * escutando. Roda também no desmonte, para o caso de a pessoa fechar a aba no
 * meio.
 */
export function useGravador({ aoTerminar, aoFalhar }: Opcoes) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canceladoRef = useRef(false);
  const segundosRef = useRef(0);

  const soltarMicrofone = useCallback(() => {
    streamRef.current?.getTracks().forEach((faixa) => faixa.stop());
    streamRef.current = null;
    if (relogioRef.current) clearInterval(relogioRef.current);
    relogioRef.current = null;
    setGravando(false);
    setSegundos(0);
    segundosRef.current = 0;
  }, []);

  useEffect(() => soltarMicrofone, [soltarMicrofone]);

  const parar = useCallback((cancelar = false) => {
    canceladoRef.current = cancelar;
    const gravador = gravadorRef.current;
    if (gravador && gravador.state !== 'inactive') gravador.stop();
    else soltarMicrofone();
  }, [soltarMicrofone]);

  const iniciar = useCallback(async () => {
    // Em HTTP sem ser localhost o navegador nem expõe a API — e é o caso de
    // quem abrir o protótipo pelo IP da máquina na rede do posto de saúde.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      aoFalhar('Seu navegador não permite gravar áudio por aqui. Pode escrever a sua dúvida?');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      canceladoRef.current = false;

      const gravador = new MediaRecorder(stream);
      gravadorRef.current = gravador;

      gravador.onstop = () => {
        const duracao = segundosRef.current;
        const cancelado = canceladoRef.current;
        const mime = gravador.mimeType || 'audio/webm';
        soltarMicrofone();
        // Gravação de menos de um segundo é toque sem querer no botão, não
        // mensagem. Descartar evita encher a transcrição de áudios de 0:00.
        if (!cancelado && duracao >= 1) aoTerminar(duracao, mime);
      };

      gravador.start();
      setGravando(true);

      relogioRef.current = setInterval(() => {
        segundosRef.current += 1;
        setSegundos(segundosRef.current);
        if (segundosRef.current >= MAXIMO_SEGUNDOS) parar(false);
      }, 1000);
    } catch {
      // Recusar o microfone é uma escolha legítima, e a mensagem não pode
      // soar como erro do aparelho nem insistir no pedido.
      aoFalhar('Não consegui acessar o microfone. Pode escrever a sua dúvida?');
      soltarMicrofone();
    }
  }, [aoFalhar, aoTerminar, parar, soltarMicrofone]);

  return { gravando, segundos, iniciar, parar };
}

/** 0:07, 1:23 — como o WhatsApp mostra durante a gravação. */
export function formatarDuracao(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}
