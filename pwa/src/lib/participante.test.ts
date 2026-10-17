import { describe, expect, it } from 'vitest';

import { diaDoContador, rotuloDoParticipante } from './participante';

describe('numeração de participante', () => {
  it('às 22h de Brasília, o contador ainda é o do dia de Brasília', () => {
    // 25/09 22:30 em Brasília = 26/09 01:30 UTC.
    const agora = new Date('2026-09-26T01:30:00Z');
    expect(diaDoContador(agora)).toBe('2026-09-25');
    expect(rotuloDoParticipante(7, agora)).toBe('Participante 7 25/09/2026');
  });

  it('logo depois da meia-noite de Brasília, já é o dia novo', () => {
    expect(diaDoContador(new Date('2026-09-26T03:00:01Z'))).toBe('2026-09-26');
  });
});
