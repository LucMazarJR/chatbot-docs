import { inicioDoDia, intervaloDoDia } from './fuso';

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

describe('intervaloDoDia', () => {
    it('vai da meia-noite de Brasília até a meia-noite seguinte', () => {
        const intervalo = intervaloDoDia('2026-09-25');
        expect(intervalo?.inicio.toISOString()).toBe('2026-09-25T03:00:00.000Z');
        expect(intervalo?.fim.toISOString()).toBe('2026-09-26T03:00:00.000Z');
    });

    it('atravessa a virada do mês', () => {
        expect(intervaloDoDia('2026-09-30')?.fim.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    });

    it('recusa o que não é uma data real', () => {
        expect(intervaloDoDia('2026-02-31')).toBeNull();
        expect(intervaloDoDia('ontem')).toBeNull();
        expect(intervaloDoDia('')).toBeNull();
    });
});
