import { granularidadeDo, intervaloDe, montarSerie } from './serie';

// Brasília é UTC-3: 01:00 UTC do dia 27 ainda é 22h do dia 26.
const em = (iso: string) => new Date(iso);

describe('intervaloDe', () => {
    it('usa o dia de Brasília, e não o de Greenwich', () => {
        expect(intervaloDe(em('2026-11-27T01:00:00Z'), 'dia')).toBe('2026-11-26');
        expect(intervaloDe(em('2026-11-27T01:00:00Z'), 'hora')).toBe('2026-11-26T22');
    });

    it('a semana começa na segunda', () => {
        // 26/11/2026 é quinta; a segunda da semana é 23/11.
        expect(intervaloDe(em('2026-11-26T15:00:00Z'), 'semana')).toBe('2026-11-23');
        // Domingo 29/11 às 22h em Brasília ainda é da semana de 23/11.
        expect(intervaloDe(em('2026-11-30T01:00:00Z'), 'semana')).toBe('2026-11-23');
    });
});

describe('granularidadeDo', () => {
    it.each([
        ['hoje', 'hora'],
        ['dia', 'hora'],
        ['7d', 'dia'],
        ['30d', 'dia'],
        ['tudo', 'semana'],
    ])('%s vira %s', (periodo, esperada) => expect(granularidadeDo(periodo)).toBe(esperada));
});

describe('montarSerie', () => {
    const unidade = (id: string) => ({ a: 'ubs1', b: 'ubs1', c: null })[id] ?? null;

    it('conta conversas, e não perguntas, e preenche os dias parados com zero', () => {
        const serie = montarSerie(
            [
                { sessaoId: 'a', em: em('2026-11-24T13:00:00Z') },
                { sessaoId: 'a', em: em('2026-11-24T14:00:00Z') },
                { sessaoId: 'b', em: em('2026-11-26T13:00:00Z') },
                { sessaoId: 'c', em: em('2026-11-26T15:00:00Z') },
            ],
            unidade,
            'dia',
            em('2026-11-24T03:00:00Z'),
            em('2026-11-26T20:00:00Z'),
        );
        expect(serie.intervalos).toEqual(['2026-11-24', '2026-11-25', '2026-11-26']);
        expect(serie.total).toEqual([1, 0, 2]);
        expect(serie.porUnidade).toEqual({ ubs1: [1, 0, 1] });
    });

    it('sem início, começa na primeira pergunta', () => {
        const serie = montarSerie(
            [{ sessaoId: 'a', em: em('2026-11-25T13:00:00Z') }],
            unidade,
            'dia',
            null,
            em('2026-11-26T13:00:00Z'),
        );
        expect(serie.intervalos).toEqual(['2026-11-25', '2026-11-26']);
    });

    it('as horas atravessam a meia-noite', () => {
        const serie = montarSerie([], unidade, 'hora', em('2026-11-27T01:00:00Z'), em('2026-11-27T04:00:00Z'));
        expect(serie.intervalos).toEqual(['2026-11-26T22', '2026-11-26T23', '2026-11-27T00', '2026-11-27T01']);
    });

    it('sem perguntas e sem início, a série é vazia', () => {
        expect(montarSerie([], unidade, 'semana', null, new Date()).intervalos).toEqual([]);
    });
});
