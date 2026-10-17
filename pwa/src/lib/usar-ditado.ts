'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Falar em vez de escrever, pelo reconhecimento de voz do próprio navegador.
 *
 * LÓGICA DO LUCIANO: é a opção de custo zero. O áudio não passa pelo nosso
 * servidor nem por uma IA contratada: o Chrome manda para o serviço de voz do
 * Google, o Safari para o da Apple, e a página recebe só o texto. O que sai
 * daqui é texto no campo, e a pessoa revisa antes de enviar: reconhecimento de
 * voz erra nome de remédio, e uma pergunta de saúde enviada errada é pior que
 * uma digitada devagar.
 *
 * Onde o navegador não tem reconhecimento (Firefox, alguns apps instalados no
 * iPhone), `suportado` é falso e a tela sugere o microfone do teclado, que
 * existe em todo celular.
 */

type Reconhecimento = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((evento: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type ConstrutorDeReconhecimento = new () => Reconhecimento;

function construtor(): ConstrutorDeReconhecimento | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorDeReconhecimento;
    webkitSpeechRecognition?: ConstrutorDeReconhecimento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A frase para cada falha, dizendo o que fazer em seguida. */
export function mensagemDoErroDeDitado(erro: string): string {
  if (erro === 'not-allowed' || erro === 'service-not-allowed') {
    return 'O navegador não deixou usar o microfone. Libere o microfone para este site nas configurações, ou escreva a sua dúvida.';
  }
  if (erro === 'no-speech') return 'Não ouvi nada. Toque no microfone e fale de novo, ou escreva a sua dúvida.';
  if (erro === 'network') return 'O ditado precisa de internet. Confira a conexão, ou escreva a sua dúvida.';
  if (erro === 'audio-capture') return 'Não achei um microfone neste aparelho. Pode escrever a sua dúvida?';
  return 'Não consegui entender o áudio. Tente de novo, ou escreva a sua dúvida.';
}

export function useDitado({
  aoOuvir,
  aoFalhar,
}: {
  /** O texto reconhecido até agora, a cada pedaço. */
  aoOuvir: (texto: string) => void;
  aoFalhar: (aviso: string) => void;
}) {
  const [ouvindo, setOuvindo] = useState(false);
  const [suportado, setSuportado] = useState(false);
  const reconhecimentoRef = useRef<Reconhecimento | null>(null);
  const aoOuvirRef = useRef(aoOuvir);
  const aoFalharRef = useRef(aoFalhar);
  aoOuvirRef.current = aoOuvir;
  aoFalharRef.current = aoFalhar;

  // Decidido depois de montar: no servidor não existe `window`, e decidir
  // na renderização faria o HTML do servidor divergir do da tela.
  useEffect(() => setSuportado(Boolean(construtor())), []);

  useEffect(() => () => reconhecimentoRef.current?.abort(), []);

  const iniciar = useCallback(() => {
    const Construtor = construtor();
    if (!Construtor) return false;
    const reconhecimento = new Construtor();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.interimResults = true;
    // Uma frase por vez: para sozinho quando a pessoa para de falar.
    reconhecimento.continuous = false;
    reconhecimento.onresult = (evento) => {
      const texto = Array.from(evento.results)
        .map((resultado) => resultado[0]?.transcript ?? '')
        .join('')
        .trim();
      aoOuvirRef.current(texto);
    };
    reconhecimento.onerror = (evento) => {
      // "aborted" é o próprio app parando: não é falha.
      if (evento.error !== 'aborted') aoFalharRef.current(mensagemDoErroDeDitado(evento.error));
    };
    reconhecimento.onend = () => setOuvindo(false);
    reconhecimentoRef.current = reconhecimento;
    reconhecimento.start();
    setOuvindo(true);
    return true;
  }, []);

  const parar = useCallback(() => {
    reconhecimentoRef.current?.stop();
  }, []);

  return { suportado, ouvindo, iniciar, parar };
}
