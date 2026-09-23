import { inicioDoDia } from './fuso';

describe('inicioDoDia', () => {
    it('às 22h de Brasília, o dia ainda é o de Brasília, e não o de Greenwich', () => {
        // 22/09 22:30 em Brasília = 23/09 01:30 UTC.
        const agora = new Date('2026-09-23T01:30:00Z');
        expect(inicioDoDia(agora).toISOString()).toBe('2026-09-22T03:00:00.000Z');
    });

    it('no meio do dia, começa à meia-noite de Brasília', () => {
        expect(inicioDoDia(new Date('2026-09-23T15:00:00Z')).toISOString()).toBe('2026-09-23T03:00:00.000Z');
    });

    it('logo depois da meia-noite de Brasília, já é o dia novo', () => {
        expect(inicioDoDia(new Date('2026-09-23T03:00:01Z')).toISOString()).toBe('2026-09-23T03:00:00.000Z');
    });

    it('segue o fuso pedido', () => {
        expect(inicioDoDia(new Date('2026-09-23T15:00:00Z'), 'UTC').toISOString()).toBe('2026-09-23T00:00:00.000Z');
    });
});
