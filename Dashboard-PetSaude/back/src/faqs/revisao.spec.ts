import {
    conferirQueNaoPassou,
    dataComoDia,
    filtroDaRevisao,
    lerDataDeRevisao,
    situacaoDaRevisao,
} from './revisao';

// 23/11/2026, 10h em Brasília (13h UTC).
const AGORA = new Date('2026-11-23T13:00:00Z');

describe('lerDataDeRevisao', () => {
    it('lê o dia como o início dele em Brasília', () => {
        expect(lerDataDeRevisao('2026-12-01')?.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    });

    it('aceita de volta o ISO que a própria API devolve', () => {
        expect(lerDataDeRevisao('2026-12-01T03:00:00.000Z')?.toISOString()).toBe(
            '2026-12-01T03:00:00.000Z',
        );
    });

    it('distingue não mexer de tirar a revisão', () => {
        expect(lerDataDeRevisao(undefined)).toBeUndefined();
        expect(lerDataDeRevisao(null)).toBeNull();
        expect(lerDataDeRevisao('')).toBeNull();
    });

    it('recusa data que não existe, com frase para a tela', () => {
        expect(() => lerDataDeRevisao('2026-02-31')).toThrow(/não existe/);
        expect(() => lerDataDeRevisao(20261201)).toThrow(/dia, mês e ano/);
    });
});

describe('conferirQueNaoPassou', () => {
    it('aceita hoje e recusa ontem', () => {
        expect(() => conferirQueNaoPassou(lerDataDeRevisao('2026-11-23')!, AGORA)).not.toThrow();
        expect(() => conferirQueNaoPassou(lerDataDeRevisao('2026-11-22')!, AGORA)).toThrow(/já passou/);
    });
});

describe('situacaoDaRevisao', () => {
    it('vence no próprio dia', () => {
        expect(situacaoDaRevisao(lerDataDeRevisao('2026-11-23')!, AGORA)).toBe('vencida');
    });

    it('próxima dentro de 30 dias, futura depois', () => {
        expect(situacaoDaRevisao(lerDataDeRevisao('2026-12-20')!, AGORA)).toBe('proxima');
        expect(situacaoDaRevisao(lerDataDeRevisao('2027-02-01')!, AGORA)).toBe('futura');
    });
});

describe('filtroDaRevisao', () => {
    it('cada aba filtra pelo campo de data', () => {
        expect(filtroDaRevisao('vencidas', AGORA)).toEqual({ revisar_em: { $lte: AGORA } });
        expect(filtroDaRevisao('todas', AGORA)).toEqual({ revisar_em: { $type: 'date' } });
        const proximas = filtroDaRevisao('proximas', AGORA) as { revisar_em: { $gt: Date } };
        expect(proximas.revisar_em.$gt).toBe(AGORA);
    });
});

describe('dataComoDia', () => {
    it('mostra o dia de Brasília, mesmo quando em UTC já é o dia seguinte', () => {
        // 23h de 30/11 em Brasília é 02h de 01/12 em UTC.
        expect(dataComoDia(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11-30');
        expect(dataComoDia(null)).toBe('');
    });
});
