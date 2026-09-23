import { describe, expect, it } from 'vitest';

import { rotuloDoDia } from './datas';

describe('rotuloDoDia', () => {
  // 23/09 às 10h em Brasília.
  const agora = new Date('2026-09-23T13:00:00Z');

  it('diz "Hoje" para o mesmo dia de Brasília', () => {
    expect(rotuloDoDia(new Date('2026-09-23T03:30:00Z'), agora)).toBe('Hoje');
  });

  it('diz "Ontem" para a noite anterior, mesmo já sendo outro dia em UTC', () => {
    // 22/09 às 22h em Brasília = 23/09 01:00 UTC.
    expect(rotuloDoDia(new Date('2026-09-23T01:00:00Z'), agora)).toBe('Ontem');
  });

  it('mostra a data para dias mais antigos', () => {
    expect(rotuloDoDia(new Date('2026-09-16T15:00:00Z'), agora)).toBe('16 de setembro');
  });
});
