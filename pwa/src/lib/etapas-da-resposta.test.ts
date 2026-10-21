import { describe, expect, it } from 'vitest';

import { avancoDaEtapa, TETO_DO_TRECHO, trechosDaBarra } from './etapas-da-resposta';

describe('barra de progresso da resposta', () => {
  it('o trecho da etapa já nasce com um pouco de cor', () => {
    expect(avancoDaEtapa('entendendo', 0)).toBeGreaterThan(0);
  });

  it('o trecho anda sempre para a frente enquanto a etapa dura', () => {
    const marcas = [0, 500, 2000, 6000, 20_000, 90_000].map((ms) => avancoDaEtapa('escrevendo', ms));
    for (let i = 1; i < marcas.length; i += 1) expect(marcas[i]).toBeGreaterThan(marcas[i - 1]);
  });

  it('a etapa que demora não enche o trecho inteiro, nem depois de minutos', () => {
    expect(avancoDaEtapa('escrevendo', 240_000)).toBeLessThanOrEqual(TETO_DO_TRECHO);
    expect(avancoDaEtapa('entendendo', 240_000)).toBeLessThan(1);
  });

  it('a busca, que é rápida, anda mais depressa que a escrita', () => {
    expect(avancoDaEtapa('buscando', 2000)).toBeGreaterThan(avancoDaEtapa('escrevendo', 2000));
  });

  it('relógio fora de ordem não faz a barra voltar', () => {
    expect(avancoDaEtapa('entendendo', -500)).toBe(avancoDaEtapa('entendendo', 0));
  });

  it('as etapas que passaram ficam cheias, e as que faltam ficam vazias', () => {
    const [lendo, procurando, escrevendo] = trechosDaBarra('buscando', 1000);
    expect(lendo).toBe(1);
    expect(procurando).toBeGreaterThan(0);
    expect(procurando).toBeLessThan(1);
    expect(escrevendo).toBe(0);
  });

  it('concluindo, o trecho atual vai até o fim e o seguinte ainda espera vazio', () => {
    expect(trechosDaBarra('entendendo', 3000, true)).toEqual([1, 0, 0]);
  });
});
