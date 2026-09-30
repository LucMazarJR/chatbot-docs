'use client';

/**
 * Ler as respostas em voz alta, com a voz do próprio aparelho.
 *
 * LÓGICA DO LUCIANO: `speechSynthesis`, e não um serviço de voz na nuvem. O
 * pedido era o máximo de economia: a voz do celular não custa nada, não manda
 * a resposta para ninguém e funciona até sem internet. A voz é a do sistema,
 * menos natural que a de uma IA, e isso é aceitável para ler uma resposta de
 * poucas linhas.
 */

export type Velocidade = 'normal' | 'devagar';

const CHAVE_VELOCIDADE = 'pwa:voz-velocidade';
const CHAVE_AUTOMATICA = 'pwa:voz-automatica';

/**
 * O texto como deve ser falado.
 *
 * A resposta vem com a formatação do WhatsApp. Lidos em voz alta, os
 * asteriscos, sublinhados e marcadores viram "asterisco", e um link vira uma
 * sequência de letras. Os links saem com "(link)", para a pessoa saber que há
 * um endereço na tela.
 */
export function textoParaFala(texto: string): string {
  return texto
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_~]/g, '')
    .replace(/^[\s]*[•·\-]\s*/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/([.,!?:])\s*[.,]\s*/g, '$1 ')
    .trim();
}

export function vozSuportada(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** A voz em português do aparelho, se houver. As do Brasil primeiro. */
export function vozEmPortugues(): SpeechSynthesisVoice | null {
  if (!vozSuportada()) return null;
  const vozes = window.speechSynthesis.getVoices();
  return (
    vozes.find((v) => v.lang.toLowerCase() === 'pt-br') ??
    vozes.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null
  );
}

/**
 * Espera a lista de vozes carregar.
 *
 * No Chrome ela chega vazia na primeira chamada e só se completa no evento
 * `voiceschanged`: sem esperar, o aparelho parecia não ter voz em português.
 */
export function aguardarVozes(): Promise<SpeechSynthesisVoice | null> {
  if (!vozSuportada()) return Promise.resolve(null);
  const ja = vozEmPortugues();
  if (ja || window.speechSynthesis.getVoices().length > 0) return Promise.resolve(ja);
  return new Promise((resolve) => {
    const pronto = () => resolve(vozEmPortugues());
    window.speechSynthesis.addEventListener('voiceschanged', pronto, { once: true });
    setTimeout(pronto, 1500);
  });
}

export function lerVelocidade(): Velocidade {
  try {
    return localStorage.getItem(CHAVE_VELOCIDADE) === 'devagar' ? 'devagar' : 'normal';
  } catch {
    return 'normal';
  }
}

export function guardarVelocidade(velocidade: Velocidade): void {
  try {
    localStorage.setItem(CHAVE_VELOCIDADE, velocidade);
  } catch {
    // Vale para esta visita.
  }
}

export function lerAutomatica(): boolean {
  try {
    return localStorage.getItem(CHAVE_AUTOMATICA) === 'sim';
  } catch {
    return false;
  }
}

export function guardarAutomatica(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE_AUTOMATICA, ligada ? 'sim' : 'nao');
  } catch {
    // Vale para esta visita.
  }
}

/**
 * Fala o texto, parando o que estiver sendo falado antes.
 *
 * Devolve falso quando não há voz em português: ler português com a voz em
 * inglês do sistema sai incompreensível, e é melhor dizer que não dá.
 */
export async function falar(texto: string, aoTerminar?: () => void): Promise<boolean> {
  const voz = await aguardarVozes();
  if (!voz) return false;
  window.speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(textoParaFala(texto));
  fala.voice = voz;
  fala.lang = voz.lang;
  fala.rate = lerVelocidade() === 'devagar' ? 0.8 : 1;
  fala.onend = () => aoTerminar?.();
  fala.onerror = () => aoTerminar?.();
  window.speechSynthesis.speak(fala);
  return true;
}

export function pararDeFalar(): void {
  if (vozSuportada()) window.speechSynthesis.cancel();
}
