import { describe, expect, it } from 'vitest';

import { cotaDoDia, diaDaCota, proximaViradaDaCota, voltaEmDaRecusa } from './voz-ia';

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

describe('proximaViradaDaCota', () => {
  it('é a meia-noite do Pacífico: 7h UTC no horário de verão de lá', () => {
    expect(proximaViradaDaCota(new Date('2026-10-20T12:00:00Z')).toISOString()).toBe('2026-10-21T07:00:00.000Z');
  });

  it('e 8h UTC fora dele', () => {
    expect(proximaViradaDaCota(new Date('2026-12-01T12:00:00Z')).toISOString()).toBe('2026-12-02T08:00:00.000Z');
  });

  it('acerta o dia em que o horário de verão de lá acaba', () => {
    // 1/11/2026, 4h no Pacífico, já fora do horário de verão.
    expect(proximaViradaDaCota(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    // Na véspera, ainda no horário de verão: a meia-noite de 1/11 é às 7h UTC.
    expect(proximaViradaDaCota(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
  });

  it('de madrugada em Brasília, a cota volta no mesmo dia', () => {
    // 20/10 às 2h em Brasília ainda é 19/10 no Pacífico: volta às 4h de Brasília.
    expect(proximaViradaDaCota(new Date('2026-10-20T05:00:00Z')).toISOString()).toBe('2026-10-20T07:00:00.000Z');
  });
});

describe('voltaEmDaRecusa', () => {
  const agora = new Date('2026-10-20T12:00:00Z');

  it('a cota do dia bloqueia até a virada', () => {
    expect(voltaEmDaRecusa('esgotada', agora)?.toISOString()).toBe('2026-10-21T07:00:00.000Z');
    expect(voltaEmDaRecusa('cota', agora)?.toISOString()).toBe('2026-10-21T07:00:00.000Z');
  });

  it('o limite da pessoa bloqueia pela janela', () => {
    expect(voltaEmDaRecusa('pessoa', agora)?.toISOString()).toBe('2026-10-20T12:10:00.000Z');
  });

  it('o limite do minuto e as falhas não bloqueiam', () => {
    for (const recusa of ['minuto', 'falha', 'vazia', 'longa', 'sem-chave'] as const) {
      expect(voltaEmDaRecusa(recusa, agora)).toBeNull();
    }
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
