import { describe, expect, it } from 'vitest';

import { textoParaFala } from './leitura-em-voz';

describe('textoParaFala', () => {
  it('tira a formatação do WhatsApp, que seria lida como símbolo', () => {
    expect(textoParaFala('*Jejum:* 8 horas.\n_Leve_ o pedido.')).toBe('Jejum: 8 horas. Leve o pedido.');
  });

  it('troca a lista por pausas', () => {
    expect(textoParaFala('Leve:\n• RG\n• Cartão do SUS')).toBe('Leve: RG, Cartão do SUS');
  });

  it('diz "link" no lugar do endereço', () => {
    expect(textoParaFala('Agende em https://wa.me/551637119592 pelo WhatsApp.')).toBe(
      'Agende em link pelo WhatsApp.',
    );
  });

  it('não lê emoji', () => {
    expect(textoParaFala('Tudo bem, e obrigado por avisar. 🙂')).toBe('Tudo bem, e obrigado por avisar.');
  });

  it('parágrafos viram pausa de frase', () => {
    expect(textoParaFala('Primeiro parágrafo.\n\nSegundo parágrafo.')).toBe('Primeiro parágrafo. Segundo parágrafo.');
  });
});
