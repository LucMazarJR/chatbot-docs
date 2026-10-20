import { describe, expect, it } from 'vitest';

import { bloqueioDaRecusa, bloqueiosDaSituacao, explicarBloqueio, vigentes } from './bloqueio-da-voz';

const AGORA = Date.parse('2026-10-20T15:00:00Z');
const VIRADA = '2026-10-21T07:00:00.000Z';

describe('bloqueioDaRecusa', () => {
  it('a cota do dia bloqueia até a hora que o servidor mandou', () => {
    expect(bloqueioDaRecusa({ falha: 'esgotada', voltaEm: VIRADA }, AGORA)).toEqual({ ate: Date.parse(VIRADA), motivo: 'dia' });
    expect(bloqueioDaRecusa({ falha: 'cota', voltaEm: VIRADA }, AGORA)?.motivo).toBe('dia');
  });

  it('o limite da pessoa bloqueia pela janela dela', () => {
    expect(bloqueioDaRecusa({ falha: 'pessoa', voltaEm: '2026-10-20T15:10:00Z' }, AGORA)?.motivo).toBe('pessoa');
  });

  it('sem hora de volta, ou com a hora já passada, não bloqueia', () => {
    expect(bloqueioDaRecusa({ falha: 'esgotada' }, AGORA)).toBeNull();
    expect(bloqueioDaRecusa({ falha: 'esgotada', voltaEm: '2026-10-20T14:00:00Z' }, AGORA)).toBeNull();
  });

  it('o limite do minuto e as falhas não bloqueiam', () => {
    expect(bloqueioDaRecusa({ falha: 'minuto', voltaEm: VIRADA }, AGORA)).toBeNull();
    expect(bloqueioDaRecusa({ falha: 'falha' }, AGORA)).toBeNull();
    expect(bloqueioDaRecusa(null, AGORA)).toBeNull();
  });
});

describe('bloqueiosDaSituacao', () => {
  it('bloqueia só a parte que acabou', () => {
    const bloqueios = bloqueiosDaSituacao({ audio: true, vozNatural: false, motivo: 'esgotada', voltaEm: VIRADA }, AGORA);
    expect(bloqueios.audio).toBeUndefined();
    expect(bloqueios.vozNatural?.motivo).toBe('dia');
  });

  it('com o teto do dia, as duas', () => {
    const bloqueios = bloqueiosDaSituacao({ audio: false, vozNatural: false, motivo: 'esgotada', voltaEm: VIRADA }, AGORA);
    expect(Object.keys(bloqueios).sort()).toEqual(['audio', 'vozNatural']);
  });

  it('tudo disponível, nenhum', () => {
    expect(bloqueiosDaSituacao({ audio: true, vozNatural: true }, AGORA)).toEqual({});
  });
});

describe('vigentes', () => {
  it('tira os que já venceram', () => {
    const bloqueios = { audio: { ate: AGORA - 1, motivo: 'pessoa' as const }, vozNatural: { ate: AGORA + 1, motivo: 'dia' as const } };
    expect(vigentes(bloqueios, AGORA)).toEqual({ vozNatural: bloqueios.vozNatural });
  });
});

describe('explicarBloqueio', () => {
  const FUSO = 'America/Sao_Paulo';

  it('diz a hora de amanhã em que a cota volta', () => {
    expect(explicarBloqueio({ ate: Date.parse(VIRADA), motivo: 'dia' }, AGORA, FUSO)).toBe('Acabou por hoje. Volta amanhã às 4h.');
  });

  it('de madrugada, a cota volta no mesmo dia', () => {
    const madrugada = Date.parse('2026-10-21T05:00:00Z');
    expect(explicarBloqueio({ ate: Date.parse(VIRADA), motivo: 'dia' }, madrugada, FUSO)).toBe('Acabou por agora. Volta hoje às 4h.');
  });

  it('o limite da pessoa diz os minutos', () => {
    expect(explicarBloqueio({ ate: AGORA + 9.5 * 60_000, motivo: 'pessoa' }, AGORA, FUSO)).toBe('Muitos seguidos. Volta em 10 minutos.');
    expect(explicarBloqueio({ ate: AGORA + 20_000, motivo: 'pessoa' }, AGORA, FUSO)).toBe('Muitos seguidos. Volta em 1 minuto.');
  });

  it('sem chave no servidor, não promete volta', () => {
    expect(explicarBloqueio({ ate: Infinity, motivo: 'ambiente' }, AGORA, FUSO)).toBe('Não está ligada neste ambiente.');
  });
});
