import {
    montarAvisos,
    plataformaDe,
    problemaNaJanela,
    resumirPorPlataforma,
    VALIDADE_MAXIMA_MS,
} from './regras';
import type { Entrega } from './tipos';

const MINUTO = 60 * 1000;
const agora = new Date('2026-09-16T12:00:00Z');
const daqui = (ms: number) => new Date(agora.getTime() + ms);

describe('problemaNaJanela', () => {
    it('aceita enviar agora e valer por um dia', () => {
        expect(problemaNaJanela(agora, daqui(24 * 60 * MINUTO), agora)).toBeNull();
    });

    it('tolera alguns minutos de diferenca entre os relogios', () => {
        expect(problemaNaJanela(daqui(-3 * MINUTO), daqui(60 * MINUTO), agora)).toBeNull();
    });

    it('recusa envio no passado, que sairia na hora como se fosse agendado', () => {
        expect(problemaNaJanela(daqui(-30 * MINUTO), daqui(60 * MINUTO), agora)).toMatch(/já passou/);
    });

    it('recusa validade que termina antes de dar tempo de chegar', () => {
        expect(problemaNaJanela(agora, daqui(5 * MINUTO), agora)).toMatch(/15 minutos/);
        // Conta a partir do envio, e não de agora.
        expect(problemaNaJanela(daqui(60 * MINUTO), daqui(70 * MINUTO), agora)).toMatch(/15 minutos/);
    });

    it('recusa validade maior que a que o servico de push guarda', () => {
        expect(problemaNaJanela(agora, daqui(VALIDADE_MAXIMA_MS + MINUTO), agora)).toMatch(/4 semanas/);
    });

    it('recusa data invalida', () => {
        expect(problemaNaJanela(new Date('x'), daqui(60 * MINUTO), agora)).toBe('Data inválida.');
    });
});

describe('montarAvisos', () => {
    it('cria um documento pendente por pessoa, no formato do despachante', () => {
        let n = 0;
        const avisos = montarAvisos(
            {
                loteId: 'lote-1',
                usuarioIds: ['u1', 'u2'],
                tipo: 'lembrete-exame',
                detalhe: 'Coleta amanhã às 7h, em jejum.',
                mostrarDetalhe: false,
                enviarEm: agora,
                validaAte: daqui(60 * MINUTO),
                criadaPor: 'Ana',
                agora,
            },
            () => `id-${++n}`,
        );

        expect(avisos.map((a) => [a._id, a.usuarioId])).toEqual([
            ['id-1', 'u1'],
            ['id-2', 'u2'],
        ]);
        expect(avisos[0]).toEqual({
            _id: 'id-1',
            loteId: 'lote-1',
            usuarioId: 'u1',
            tipo: 'lembrete-exame',
            detalhe: 'Coleta amanhã às 7h, em jejum.',
            mostrarDetalhe: false,
            enviarEm: agora,
            validaAte: daqui(60 * MINUTO),
            estado: 'pendente',
            tentativas: 0,
            travadaAte: null,
            recibo: null,
            entregas: [],
            motivo: null,
            criadaEm: agora,
            criadaPor: 'Ana',
            enviadaEm: null,
            exibidaEm: null,
            abertaEm: null,
            expiraEm: null,
        });
    });
});

describe('plataformaDe', () => {
    const casos: [string, string][] = [
        [
            'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
            'Android · Chrome',
        ],
        [
            'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
            'Android · Samsung Internet',
        ],
        [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
            'iOS · app na tela de início',
        ],
        [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
            'iOS · Safari',
        ],
        [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
            'Windows · Edge',
        ],
        [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0',
            'Mac · Firefox',
        ],
        ['', 'Outro sistema · outro navegador'],
    ];

    it.each(casos)('%s', (ua, esperado) => {
        expect(plataformaDe(ua)).toBe(esperado);
    });
});

describe('resumirPorPlataforma', () => {
    const android =
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
    const iphone =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

    const entrega = (dados: Partial<Entrega>): Entrega => ({
        inscricaoId: 'i1',
        resultado: 'enviada',
        codigo: 201,
        em: agora,
        userAgent: android,
        exibidaEm: null,
        abertaEm: null,
        ...dados,
    });

    it('conta o aparelho uma vez, mesmo com retentativa', () => {
        const resumo = resumirPorPlataforma([
            {
                entregas: [
                    entrega({ resultado: 'tentar-de-novo', codigo: 503, em: agora }),
                    entrega({ resultado: 'enviada', em: daqui(MINUTO), exibidaEm: daqui(MINUTO) }),
                ],
            },
        ]);

        expect(resumo).toEqual([
            {
                plataforma: 'Android · Chrome',
                aparelhos: 1,
                aceitas: 1,
                exibidas: 1,
                abertas: 0,
                inscricoesMortas: 0,
                falhas: 0,
            },
        ]);
    });

    it('separa as plataformas e ordena pela que tem mais aparelhos', () => {
        const resumo = resumirPorPlataforma([
            {
                entregas: [
                    entrega({ inscricaoId: 'a1', abertaEm: agora, exibidaEm: agora }),
                    entrega({ inscricaoId: 'i1', userAgent: iphone, resultado: 'inscricao-morta', codigo: 410 }),
                ],
            },
            { entregas: [entrega({ inscricaoId: 'a2' })] },
        ]);

        expect(resumo.map((r) => [r.plataforma, r.aparelhos, r.abertas, r.inscricoesMortas])).toEqual([
            ['Android · Chrome', 2, 1, 0],
            ['iOS · app na tela de início', 1, 0, 1],
        ]);
    });
});
