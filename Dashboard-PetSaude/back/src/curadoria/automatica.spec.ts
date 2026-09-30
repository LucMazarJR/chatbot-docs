import { inicioDoDia } from '../comum/fuso';
import { deveRodarSozinha, ESPERA_DEPOIS_DE_ERRO_MS, pausaDepoisDe } from './automatica';

/**
 * A análise automática das perguntas sem resposta.
 *
 * LÓGICA DO LUCIANO: o que estes testes protegem é a cota. Uma regra frouxa
 * aqui roda a análise a cada 5 minutos com a fila cheia e a cota acabada, ou
 * dispara duas ao mesmo tempo.
 */
describe('análise automática da curadoria', () => {
    const agora = new Date('2026-09-29T20:00:00Z').getTime();
    const fila = { pendentes: 10, tamanhoDaRodada: 10, rodando: false, pausadaAte: 0, agora };

    it('roda quando junta uma rodada inteira', () => {
        expect(deveRodarSozinha(fila)).toBe(true);
        expect(deveRodarSozinha({ ...fila, pendentes: 9 })).toBe(false);
    });

    it('não roda por cima de outra análise', () => {
        expect(deveRodarSozinha({ ...fila, rodando: true })).toBe(false);
    });

    it('respeita a pausa', () => {
        expect(deveRodarSozinha({ ...fila, pausadaAte: agora + 1 })).toBe(false);
        expect(deveRodarSozinha({ ...fila, pausadaAte: agora })).toBe(true);
    });

    it('cota esgotada pausa até o dia seguinte, em Brasília', () => {
        const seguinte = (d: Date) => inicioDoDia(new Date(d.getTime() + 24 * 60 * 60 * 1000));
        // 20h UTC de 29/09 são 17h em Brasília: a pausa vai até 00h de 30/09 lá.
        expect(new Date(pausaDepoisDe('cota_esgotada', agora, seguinte)).toISOString()).toBe(
            '2026-09-30T03:00:00.000Z',
        );
    });

    it('erro espera meia hora, e rodada boa não pausa', () => {
        expect(pausaDepoisDe('erro', agora, inicioDoDia)).toBe(agora + ESPERA_DEPOIS_DE_ERRO_MS);
        expect(pausaDepoisDe('concluido', agora, inicioDoDia)).toBe(0);
    });
});
