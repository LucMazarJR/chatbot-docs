import { describe, expect, it } from 'vitest';

import { decidirAvaliacao, type EstadoDaConversa } from './avaliacao-automatica';

const parada: EstadoDaConversa = {
  perguntas: 5,
  encerrada: false,
  jaOfereceu: false,
  esperandoResposta: false,
  gravando: false,
  textoNoCampo: false,
  outroPainelAberto: false,
  abaVisivel: true,
};

describe('decidirAvaliacao', () => {
  it('oferece a quem perguntou o bastante e está parado de verdade', () => {
    expect(decidirAvaliacao(parada)).toBe('oferecer');
  });

  it('não oferece enquanto a resposta está sendo esperada', () => {
    // O caso do primeiro teste: a folha abriu durante uma espera de 100 s.
    expect(decidirAvaliacao({ ...parada, esperandoResposta: true })).toBe('adiar');
  });

  it('não oferece a quem está escrevendo, gravando ou com outro painel aberto', () => {
    expect(decidirAvaliacao({ ...parada, textoNoCampo: true })).toBe('adiar');
    expect(decidirAvaliacao({ ...parada, gravando: true })).toBe('adiar');
    expect(decidirAvaliacao({ ...parada, outroPainelAberto: true })).toBe('adiar');
  });

  it('espera a aba voltar a ficar à vista', () => {
    expect(decidirAvaliacao({ ...parada, abaVisivel: false })).toBe('adiar');
  });

  it('não aborda quem fez menos de três perguntas', () => {
    expect(decidirAvaliacao({ ...parada, perguntas: 2 })).toBe('adiar');
  });

  it('oferece uma vez só por conversa', () => {
    expect(decidirAvaliacao({ ...parada, jaOfereceu: true })).toBe('desistir');
    expect(decidirAvaliacao({ ...parada, encerrada: true })).toBe('desistir');
  });
});
