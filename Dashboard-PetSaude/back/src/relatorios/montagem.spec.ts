import { inicioDoDia } from '../comum/fuso';
import {
    calcularNumeros,
    contarPorArea,
    dividirEmLotes,
    intervaloDoDia,
    juntarEscopos,
    type MensagemLida,
    montarPrompt,
    parearTrocas,
    sanearClassificacao,
    sanearEscopos,
    type SessaoLida,
    type Troca,
} from './montagem';

/**
 * O relatório do dia.
 *
 * LÓGICA DO LUCIANO: o que estes testes protegem é a verdade dos números. O
 * relatório vai para um grupo que decide o que escrever na base; uma resposta
 * pareada com a pergunta errada, ou um "falta conteúdo" numa pergunta que foi
 * respondida, mandaria a equipe trabalhar no lugar errado.
 */
describe('montagem do relatório do dia', () => {
    const dia = intervaloDoDia('2026-09-29', inicioDoDia);
    const em = (hhmmss: string) => new Date(`2026-09-29T${hhmmss}.000Z`);

    const pergunta = (id: string, hhmmss: string, extra: Partial<MensagemLida> = {}): MensagemLida => ({
        _id: id,
        sessaoId: 's1',
        papel: 'user',
        texto: `pergunta ${id}`,
        em: em(hhmmss),
        correlationId: `c-${id}`,
        ...extra,
    });

    const resposta = (id: string, hhmmss: string, extra: Partial<MensagemLida> = {}): MensagemLida => ({
        _id: `r-${id}`,
        sessaoId: 's1',
        papel: 'bot',
        texto: `resposta ${id}`,
        em: em(hhmmss),
        correlationId: `c-${id}`,
        latenciaMs: 8000,
        ...extra,
    });

    describe('intervaloDoDia', () => {
        it('usa o dia de Brasília, e não o de Greenwich', () => {
            expect(dia.inicio.toISOString()).toBe('2026-09-29T03:00:00.000Z');
            expect(dia.fim.toISOString()).toBe('2026-09-30T03:00:00.000Z');
        });

        it('recusa data em outro formato', () => {
            expect(() => intervaloDoDia('29/09/2026', inicioDoDia)).toThrow('AAAA-MM-DD');
        });
    });

    describe('parearTrocas', () => {
        it('pareia pelo correlationId mesmo quando a resposta tem o mesmo instante da pergunta', () => {
            // O caso real: o banco devolveu a resposta ANTES da pergunta.
            const trocas = parearTrocas(
                [resposta('1', '11:17:13'), pergunta('1', '11:17:13'), pergunta('2', '11:17:55'), resposta('2', '11:17:55')],
                dia.inicio,
                dia.fim,
            );

            expect(trocas.map((t) => [t.pergunta, t.resposta])).toEqual([
                ['pergunta 1', 'resposta 1'],
                ['pergunta 2', 'resposta 2'],
            ]);
        });

        it('deixa de fora tentativas de áudio e perguntas de outro dia', () => {
            const trocas = parearTrocas(
                [
                    pergunta('audio', '12:00:00', { tipo: 'audio' }),
                    pergunta('ontem', '02:59:59'),
                    pergunta('hoje', '03:00:00'),
                ],
                dia.inicio,
                dia.fim,
            );

            expect(trocas.map((t) => t.perguntaId)).toEqual(['hoje']);
        });

        it('tira a situação das marcas do banco', () => {
            const trocas = parearTrocas(
                [
                    pergunta('a', '12:00:00'),
                    resposta('a', '12:00:00'),
                    pergunta('b', '12:01:00'),
                    resposta('b', '12:01:00', { semResposta: true }),
                    pergunta('c', '12:02:00'),
                    resposta('c', '12:02:00', { erro: true }),
                    pergunta('d', '12:03:00'),
                    resposta('d', '12:03:00', { pendente: true }),
                    pergunta('e', '12:04:00'),
                ],
                dia.inicio,
                dia.fim,
            );

            expect(trocas.map((t) => t.situacao)).toEqual([
                'respondida',
                'sem_resposta',
                'falhou',
                'sem_retorno',
                'sem_retorno',
            ]);
        });

        it('sem correlationId, usa a primeira resposta seguinte da mesma sessão', () => {
            const trocas = parearTrocas(
                [
                    pergunta('x', '12:00:00', { correlationId: null }),
                    resposta('outra-sessao', '12:00:01', { correlationId: null, sessaoId: 's2' }),
                    resposta('x', '12:00:02', { correlationId: null }),
                ],
                dia.inicio,
                dia.fim,
            );

            expect(trocas[0].respostaId).toBe('r-x');
        });
    });

    describe('calcularNumeros', () => {
        it('conta do banco o que o relatório mostra', () => {
            const mensagens = [
                pergunta('1', '12:00:00'),
                resposta('1', '12:00:00', { feedback: 'up', latenciaMs: 10_000 }),
                pergunta('2', '12:05:00'),
                resposta('2', '12:05:00', { semResposta: true, feedback: 'down', latenciaMs: 70_000 }),
                pergunta('3', '12:06:00', { tipo: 'audio' }),
            ];
            const sessoes: SessaoLida[] = [
                {
                    _id: 's1',
                    nome: 'Participante 1',
                    iniciadaEm: em('11:59:00'),
                    consentimentoEm: em('11:59:30'),
                    avaliacao: { estrelas: 4, nps: 8, comentario: '  Poderia ser mais rápido ' },
                },
                // Aceitou e foi embora sem perguntar.
                { _id: 's2', nome: 'Participante 2', iniciadaEm: em('13:00:00'), consentimentoEm: em('13:00:05') },
            ];
            const trocas = parearTrocas(mensagens, dia.inicio, dia.fim);

            const numeros = calcularNumeros(trocas, sessoes, mensagens, dia.inicio, dia.fim);

            expect(numeros).toMatchObject({
                conversas: 1,
                perguntas: 2,
                respondidas: 1,
                semResposta: 1,
                positivos: 1,
                negativos: 1,
                avaliacoes: 1,
                notaMedia: 4,
                npsMedio: 8,
                comentarios: ['Poderia ser mais rápido'],
                latenciaMediana: 10_000,
                latenciaMaxima: 70_000,
                respostasAcimaDe60s: 1,
                aceitaramSemPerguntar: 1,
                tentativasDeAudioOuArquivo: 1,
            });
        });
    });

    describe('dividirEmLotes', () => {
        it('divide em partes iguais em vez de sobrar um lote de uma pergunta', () => {
            const lotes = dividirEmLotes(Array.from({ length: 101 }, (_, i) => i), 100);
            expect(lotes.map((l) => l.length)).toEqual([51, 50]);
        });

        it('lista vazia não vira lote', () => {
            expect(dividirEmLotes([], 100)).toEqual([]);
        });
    });

    const troca = (situacao: Troca['situacao'], texto = 'como renovar receita vencida'): Troca => ({
        perguntaId: texto,
        respostaId: null,
        sessaoId: 's1',
        em: em('12:00:00'),
        pergunta: texto,
        resposta: '',
        situacao,
        feedback: null,
        latenciaMs: null,
        trechos: [],
    });

    describe('sanearClassificacao', () => {
        it('confere a causa contra a situação que o banco registrou', () => {
            const lote = [troca('respondida'), troca('sem_resposta'), troca('falhou')];
            const classificacoes = sanearClassificacao(
                {
                    perguntas: [
                        { n: 1, area: 'Vacinação', publico: 'cidadao', causa: 'falta_conteudo', comentario: 'ok' },
                        { n: 2, area: 'Vacinas', publico: 'medico', causa: 'respondida', comentario: 'x' },
                        { n: 3, area: 'Exames', publico: 'cidadao', causa: 'busca_nao_trouxe', comentario: 'y' },
                    ],
                },
                lote,
            );

            expect(classificacoes.map((c) => c.causa)).toEqual([
                'respondida',
                'nao_classificada',
                'falha_tecnica',
            ]);
            // Área e público fora da lista não passam.
            expect(classificacoes[1]).toMatchObject({ area: 'Outros', publico: 'cidadao' });
        });

        it('devolve uma classificação para cada pergunta, mesmo com a resposta do modelo quebrada', () => {
            const lote = [troca('sem_resposta'), troca('respondida')];
            expect(sanearClassificacao('isso não é JSON', lote)).toHaveLength(2);
            expect(sanearClassificacao({ perguntas: [{ n: 7, area: 'Exames' }] }, lote)[0].area).toBe('Outros');
        });
    });

    describe('escopos', () => {
        it('traduz o número dentro do lote para a posição no dia e descarta o que não aponta para nada', () => {
            const escopos = sanearEscopos(
                {
                    escopos: [
                        { tema: 'Receita vencida', perguntas: [1, 2, 99], motivo: 'm', sugestao: 's' },
                        { tema: 'Sem origem', perguntas: [42], motivo: 'm', sugestao: 's' },
                    ],
                },
                3,
                100,
            );

            expect(escopos).toEqual([{ tema: 'Receita vencida', perguntas: [100, 101], motivo: 'm', sugestao: 's' }]);
        });

        it('sem síntese aproveitável, fica com os escopos de cada lote', () => {
            const dosLotes = [{ tema: 'A', perguntas: [1], motivo: '', sugestao: '' }];
            expect(juntarEscopos({ escopos: [] }, dosLotes)).toEqual(dosLotes);
            expect(
                juntarEscopos({ escopos: [{ tema: 'A e B', de: [1], motivo: 'm', sugestao: 's' }] }, dosLotes)[0]
                    .perguntas,
            ).toEqual([1]);
        });
    });

    it('conta por área a partir do rótulo de cada pergunta', () => {
        const trocas = [troca('respondida'), troca('sem_resposta'), troca('sem_resposta')];
        const porArea = contarPorArea(trocas, [
            { area: 'Exames', publico: 'cidadao', causa: 'respondida', comentario: '' },
            { area: 'Medicamentos e receitas', publico: 'cidadao', causa: 'falta_conteudo', comentario: '' },
            { area: 'Medicamentos e receitas', publico: 'cidadao', causa: 'busca_nao_trouxe', comentario: '' },
        ]);

        expect(porArea[0]).toEqual({
            area: 'Medicamentos e receitas',
            total: 2,
            respondidas: 0,
            semResposta: 2,
            falhas: 0,
        });
    });

    it('o prompt numera as perguntas do lote e não usa travessão', () => {
        const prompt = montarPrompt([troca('sem_resposta', 'endereço "nga"')]);
        expect(prompt).toContain(`1. [SEM RESPOSTA] "endereço 'nga'"`);
        expect(prompt).not.toContain('—');
    });

    it('o prompt não arredonda um trecho de fora para dentro do corte', () => {
        const prompt = montarPrompt([
            {
                ...troca('sem_resposta', 'nga-16'),
                trechos: [{ question: 'O que é o NGA 16?', category: null, score: 0.8198, usado: false }],
            },
        ]);
        expect(prompt).toContain('0.8198 abaixo do corte: O que é o NGA 16?');
    });
});
