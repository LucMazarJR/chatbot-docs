import { describe, expect, it } from 'vitest';

import { lerEscolhasDeVoz } from './escolhas-de-voz';

const guardado = (valores: Record<string, string>) => (chave: string) => valores[chave] ?? null;

describe('lerEscolhasDeVoz', () => {
  it('sem nada guardado, a IA entende e a voz natural padrão fala', () => {
    expect(lerEscolhasDeVoz(guardado({}))).toEqual({ entrada: 'ia', voz: 'Sulafat' });
  });

  it('lê as duas escolhas', () => {
    expect(lerEscolhasDeVoz(guardado({ 'pwa:voz-entrada': 'celular', 'pwa:voz-natural': 'celular' }))).toEqual({
      entrada: 'celular',
      voz: 'celular',
    });
    expect(lerEscolhasDeVoz(guardado({ 'pwa:voz-natural': 'Kore' })).voz).toBe('Kore');
  });

  it('quem desligou a voz por IA antes das duas escolhas continua com as duas no celular', () => {
    expect(lerEscolhasDeVoz(guardado({ 'pwa:voz-ia': 'desligada' }))).toEqual({ entrada: 'celular', voz: 'celular' });
  });

  it('a escolha nova vale mais que a chave antiga', () => {
    const escolhas = lerEscolhasDeVoz(guardado({ 'pwa:voz-ia': 'desligada', 'pwa:voz-entrada': 'ia', 'pwa:voz-natural': 'Charon' }));
    expect(escolhas).toEqual({ entrada: 'ia', voz: 'Charon' });
  });

  it('valor estranho volta ao padrão', () => {
    expect(lerEscolhasDeVoz(guardado({ 'pwa:voz-entrada': 'talvez', 'pwa:voz-natural': 'Robô' }))).toEqual({ entrada: 'ia', voz: 'Sulafat' });
  });
});
