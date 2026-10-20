import { describe, expect, it } from 'vitest';

import { DISTANCIA, MARGEM, posicionarBalao } from './posicao-do-balao';

// Celular de 390 x 800, caixa de 300 px.
const tela = { larguraDaTela: 390, alturaDaTela: 800, larguraDoBalao: 300 };

describe('posicionarBalao', () => {
  it('sem elemento, fica no meio e sem seta', () => {
    const p = posicionarBalao({ ...tela, alvo: null });
    expect(p.lado).toBe('centro');
    expect(p.left).toBe(45);
    expect(p.setaX).toBeNull();
  });

  it('elemento embaixo (o campo de mensagem): a caixa fica acima dele, sem cobri-lo', () => {
    const campo = { top: 740, left: 8, width: 320, height: 48 };
    const p = posicionarBalao({ ...tela, alvo: campo });
    expect(p.lado).toBe('acima');
    // A borda de baixo da caixa fica DISTANCIA acima do topo do campo.
    expect(800 - (p.bottom ?? 0)).toBe(campo.top - DISTANCIA);
    expect(p.maxHeight).toBe(campo.top - DISTANCIA - MARGEM);
  });

  it('elemento no canto direito (o botão de enviar): a caixa encosta na margem e a seta aponta para ele', () => {
    const enviar = { top: 740, left: 334, width: 48, height: 48 };
    const p = posicionarBalao({ ...tela, alvo: enviar });
    expect(p.left).toBe(390 - MARGEM - 300);
    // A seta cai sobre o centro do botão.
    expect(p.left + (p.setaX ?? 0)).toBe(358);
  });

  it('elemento em cima (o menu): a caixa fica abaixo dele', () => {
    const menu = { top: 8, left: 340, width: 44, height: 44 };
    const p = posicionarBalao({ ...tela, alvo: menu });
    expect(p.lado).toBe('abaixo');
    expect(p.top).toBe(8 + 44 + DISTANCIA);
  });

  it('a seta nunca encosta no canto arredondado da caixa', () => {
    const quaseNaBorda = { top: 740, left: 382, width: 8, height: 40 };
    const p = posicionarBalao({ ...tela, alvo: quaseNaBorda });
    expect(p.setaX).toBeLessThanOrEqual(300 - 18);
  });

  it('caixa mais larga que a tela fica com a largura da tela menos as margens', () => {
    const p = posicionarBalao({ larguraDaTela: 320, alturaDaTela: 600, larguraDoBalao: 400, alvo: null });
    expect(p.left).toBe(MARGEM);
  });
});
