import { describe, expect, it } from 'vitest';

import { cotaDoDia, diaDaCota } from './voz-ia';

describe('cotaDoDia', () => {
  it('reconhece a cota diária pelo id da violação', () => {
    const corpo = { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
    expect(cotaDoDia(corpo)).toBe(true);
  });

  it('limite por minuto não é a cota do dia', () => {
    const corpo = { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } };
    expect(cotaDoDia(corpo)).toBe(false);
  });

  it('429 sem detalhes não desliga a voz o dia inteiro', () => {
    expect(cotaDoDia(null)).toBe(false);
    expect(cotaDoDia({ error: { message: 'Resource exhausted' } })).toBe(false);
  });
});

describe('diaDaCota', () => {
  it('conta o dia no horário do Pacífico, quando o Google zera a cota', () => {
    // 20/10 às 3h em Brasília ainda é 19/10 no Pacífico.
    expect(diaDaCota(new Date('2026-10-20T06:00:00Z'))).toBe('2026-10-19');
    // 20/10 às 9h em Brasília já é 20/10 lá.
    expect(diaDaCota(new Date('2026-10-20T12:00:00Z'))).toBe('2026-10-20');
  });
});
