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

import { textoParaFala } from './texto-para-fala';
import { CHAVE_ENTRADA, CHAVE_VOZ, lerEscolhasDeVoz, type Entrada } from './escolhas-de-voz';
import type { EscolhaDeVoz } from './vozes';

export { textoParaFala };

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

/** As escolhas de voz do staging guardadas no aparelho (ver `escolhas-de-voz.ts`). */
export function lerEscolhas() {
  try {
    return lerEscolhasDeVoz((chave) => localStorage.getItem(chave));
  } catch {
    return lerEscolhasDeVoz(() => null);
  }
}

export function guardarEntrada(entrada: Entrada): void {
  try {
    localStorage.setItem(CHAVE_ENTRADA, entrada);
  } catch {
    // Vale para esta visita.
  }
}

export function guardarVozEscolhida(voz: EscolhaDeVoz): void {
  try {
    localStorage.setItem(CHAVE_VOZ, voz);
  } catch {
    // Vale para esta visita.
  }
}

/** A velocidade de reprodução do áudio da voz natural: "devagar" pausa sem engrossar a voz. */
export function taxaDeReproducao(): number {
  return lerVelocidade() === 'devagar' ? 0.85 : 1;
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
