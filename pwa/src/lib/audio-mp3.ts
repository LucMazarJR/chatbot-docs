import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * O áudio da voz natural, do formato do Gemini para MP3.
 *
 * LÓGICA DO LUCIANO: o Gemini devolve PCM de 24 kHz, que dá 48 KB por segundo
 * de fala. Uma resposta típica (cerca de 540 caracteres, 50 segundos falados)
 * passava de 2 MB, e a mais longa medida passaria de 7 MB, acima do limite de
 * 4,5 MB de resposta da Vercel. Em MP3 de 48 kbps a mesma resposta tem cerca de
 * 300 KB: cabe com folga e chega rápido no 4G de quem está no posto.
 */

export type Pcm = { amostras: Int16Array; taxa: number };

/**
 * Lê o que o Gemini devolveu: um WAV com cabeçalho, ou PCM cru com a taxa no
 * tipo (`audio/L16;codec=pcm;rate=24000`). Os modelos já devolveram os dois.
 */
export function lerPcmDoGemini(bytes: Uint8Array, mime: string): Pcm {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ehWav =
    bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE';

  if (!ehWav) {
    const taxa = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    return { amostras: new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.length - (bytes.length % 2)))), taxa };
  }

  // Percorre os pedaços do WAV em vez de supor o cabeçalho de 44 bytes: um
  // pedaço extra (LIST, fact) deslocaria o início do som.
  let taxa = 24000;
  let posicao = 12;
  while (posicao + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(posicao, posicao + 4));
    const tamanho = visao.getUint32(posicao + 4, true);
    const inicio = posicao + 8;
    if (id === 'fmt ') taxa = visao.getUint32(inicio + 4, true);
    if (id === 'data') {
      const fim = Math.min(inicio + tamanho, bytes.length);
      const util = fim - inicio - ((fim - inicio) % 2);
      return { amostras: new Int16Array(bytes.buffer.slice(bytes.byteOffset + inicio, bytes.byteOffset + inicio + util)), taxa };
    }
    posicao = inicio + tamanho + (tamanho % 2);
  }
  return { amostras: new Int16Array(0), taxa };
}

/** Mono, 48 kbps: voz falada não ganha nada acima disso. */
export function paraMp3({ amostras, taxa }: Pcm, kbps = 48): Uint8Array<ArrayBuffer> {
  const codificador = new Mp3Encoder(1, taxa, kbps);
  const partes: Uint8Array[] = [];
  for (let i = 0; i < amostras.length; i += 1152) {
    const pedaco = codificador.encodeBuffer(amostras.subarray(i, i + 1152));
    if (pedaco.length) partes.push(new Uint8Array(pedaco));
  }
  const fim = codificador.flush();
  if (fim.length) partes.push(new Uint8Array(fim));

  const total = partes.reduce((soma, parte) => soma + parte.length, 0);
  const mp3 = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    mp3.set(parte, posicao);
    posicao += parte.length;
  }
  return mp3;
}
