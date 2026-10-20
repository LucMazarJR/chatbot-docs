import { describe, expect, it } from 'vitest';

import { lerPcmDoGemini, paraMp3 } from './audio-mp3';

/** Um WAV mono de 16 bits, com um pedaço LIST antes do som, como alguns geradores fazem. */
function wav(amostras: number[], taxa: number, comList = false): Uint8Array {
  const dados = new Uint8Array(new Int16Array(amostras).buffer);
  const list = comList ? new Uint8Array([...'LIST'].map((c) => c.charCodeAt(0)).concat([4, 0, 0, 0, 1, 2, 3, 4])) : new Uint8Array(0);
  const cabeca = new ArrayBuffer(36);
  const v = new DataView(cabeca);
  const escrever = (pos: number, texto: string) => [...texto].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  escrever(0, 'RIFF');
  v.setUint32(4, 28 + list.length + 8 + dados.length, true);
  escrever(8, 'WAVE');
  escrever(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  const data = new Uint8Array(8);
  [...'data'].forEach((c, i) => (data[i] = c.charCodeAt(0)));
  new DataView(data.buffer).setUint32(4, dados.length, true);
  return new Uint8Array([...new Uint8Array(cabeca), ...list, ...data, ...dados]);
}

describe('lerPcmDoGemini', () => {
  it('lê o WAV com cabeçalho, inclusive com um pedaço extra antes do som', () => {
    const pcm = lerPcmDoGemini(wav([1, -2, 300], 24000, true), 'audio/wav');
    expect(pcm.taxa).toBe(24000);
    expect([...pcm.amostras]).toEqual([1, -2, 300]);
  });

  it('lê o PCM cru, com a taxa no tipo', () => {
    const cru = new Uint8Array(new Int16Array([5, 6]).buffer);
    const pcm = lerPcmDoGemini(cru, 'audio/L16;codec=pcm;rate=16000');
    expect(pcm.taxa).toBe(16000);
    expect([...pcm.amostras]).toEqual([5, 6]);
  });
});

describe('paraMp3', () => {
  it('um segundo de som vira um MP3 bem menor que o PCM', () => {
    const taxa = 24000;
    const amostras = Int16Array.from({ length: taxa }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / taxa)));
    const mp3 = paraMp3({ amostras, taxa });
    expect(mp3.length).toBeGreaterThan(1000);
    expect(mp3.length).toBeLessThan(amostras.byteLength / 5);
  });
});
