import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import { ActivityService } from '../activity/activity.service';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { LOTE_DE_INSERCAO, NotificacoesService } from './notificacoes.service';
import { ContaPwa } from './schemas/conta-pwa.schema';
import { InscricaoPush } from './schemas/inscricao-push.schema';
import { Notificacao } from './schemas/notificacao.schema';

/**
 * O agendamento de avisos pela equipe.
 *
 * LÓGICA DO LUCIANO: o que estes testes protegem é o contrato com o despachante
 * do PWA e o que NÃO pode vazar. Um campo com nome errado deixa o aviso parado
 * na fila para sempre, sem erro nenhum; e o texto do lembrete no histórico diria
 * qual exame a pessoa vai fazer.
 */
describe('NotificacoesService', () => {
    let service: NotificacoesService;
    let contas: { _id: string; email: string; nome: string | null }[];
    let inscricoes: { usuarioId: string; userAgent: string; ultimoSucessoEm: Date | null }[];
    let inseridos: any[][];
    let insertMany: jest.Mock;
    let updateMany: jest.Mock;
    let registrar: jest.Mock;
    let avisosDoLote: any[];

    const android =
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

    const consulta = (resultado: () => any) => {
        const encadeado: any = {
            select: () => encadeado,
            lean: () => encadeado,
            exec: jest.fn(async () => resultado()),
        };
        return encadeado;
    };

    const emUmaHora = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

    beforeEach(async () => {
        contas = [
            { _id: 'u1', email: 'bia@exemplo.com', nome: 'Bia' },
            { _id: 'u2', email: 'ana@exemplo.com', nome: null },
        ];
        inscricoes = [
            { usuarioId: 'u1', userAgent: android, ultimoSucessoEm: null },
            { usuarioId: 'u2', userAgent: android, ultimoSucessoEm: null },
            // Resto de uma conta apagada.
            { usuarioId: 'fantasma', userAgent: android, ultimoSucessoEm: null },
        ];
        inseridos = [];
        avisosDoLote = [];
        insertMany = jest.fn(async (docs: any[]) => {
            inseridos.push(docs);
            return { insertedCount: docs.length };
        });
        updateMany = jest.fn(() => ({ exec: jest.fn(async () => ({ modifiedCount: 2 })) }));
        registrar = jest.fn();

        const notificacaoModel = {
            collection: { insertMany },
            updateMany,
            find: jest.fn(() => consulta(() => avisosDoLote)),
            findOne: jest.fn(() => consulta(() => avisosDoLote[0] ?? null)),
            aggregate: jest.fn(() => ({ exec: jest.fn(async () => []) })),
        };

        const contaModel = {
            find: jest.fn((filtro: any) =>
                consulta(() => contas.filter((conta) => filtro._id.$in.includes(conta._id))),
            ),
            countDocuments: jest.fn(() => ({ exec: jest.fn(async () => contas.length + 3) })),
        };

        const inscricaoModel = {
            distinct: jest.fn(() => ({
                exec: jest.fn(async () => [...new Set(inscricoes.map((i) => i.usuarioId))]),
            })),
            aggregate: jest.fn(() => ({
                exec: jest.fn(async () => {
                    const grupos = new Map<string, any>();
                    for (const i of inscricoes) {
                        const g = grupos.get(i.usuarioId) ?? {
                            _id: i.usuarioId,
                            aparelhos: 0,
                            userAgents: [],
                            ultimoSucessoEm: null,
                        };
                        g.aparelhos += 1;
                        g.userAgents.push(i.userAgent);
                        grupos.set(i.usuarioId, g);
                    }
                    return [...grupos.values()];
                }),
            })),
        };

        const modulo: TestingModule = await Test.createTestingModule({
            providers: [
                NotificacoesService,
                { provide: getModelToken(Notificacao.name, CONEXAO_PROTOTIPO), useValue: notificacaoModel },
                { provide: getModelToken(ContaPwa.name, CONEXAO_PROTOTIPO), useValue: contaModel },
                { provide: getModelToken(InscricaoPush.name, CONEXAO_PROTOTIPO), useValue: inscricaoModel },
                { provide: ActivityService, useValue: { registrar } },
            ],
        }).compile();

        service = modulo.get(NotificacoesService);
    });

    const ana = { id: 'admin-1', name: 'Ana' };

    describe('destinatarios', () => {
        it('lista as contas com aparelho, sem as que ja nao existem', async () => {
            const r = await service.destinatarios();

            expect(r.contas.map((c) => c.email)).toEqual(['ana@exemplo.com', 'bia@exemplo.com']);
            expect(r.contas[0]).toMatchObject({ id: 'u2', aparelhos: 1, plataformas: ['Android · Chrome'] });
            expect(r.contasSemAparelho).toBe(3);
        });
    });

    describe('criar', () => {
        it('grava um aviso pendente por pessoa escolhida, no formato do despachante', async () => {
            const r = await service.criar(
                {
                    tipo: 'lembrete-exame',
                    detalhe: '  Coleta amanhã às 7h, em jejum.  ',
                    destinatarios: ['u1', 'u1', 'sumiu'],
                    validaAte: emUmaHora(),
                },
                ana,
            );

            expect(r).toMatchObject({ criadas: 1, ignorados: 1 });
            expect(inseridos).toHaveLength(1);
            const [aviso] = inseridos[0];
            expect(aviso).toMatchObject({
                loteId: r.loteId,
                usuarioId: 'u1',
                tipo: 'lembrete-exame',
                detalhe: 'Coleta amanhã às 7h, em jejum.',
                mostrarDetalhe: false,
                estado: 'pendente',
                tentativas: 0,
                travadaAte: null,
                recibo: null,
                entregas: [],
                criadaPor: 'Ana',
                expiraEm: null,
            });
            expect(typeof aviso._id).toBe('string');
            expect(aviso.enviarEm).toBeInstanceOf(Date);
            expect(aviso.validaAte).toBeInstanceOf(Date);
        });

        it('"todas as contas" leva so quem tem aparelho e conta existente', async () => {
            const r = await service.criar(
                { tipo: 'aviso', detalhe: 'Campanha de vacina sábado.', todos: true, validaAte: emUmaHora() },
                ana,
            );

            expect(r.criadas).toBe(2);
            expect(inseridos[0].map((a: any) => a.usuarioId).sort()).toEqual(['u1', 'u2']);
        });

        it('insere em partes quando sao muitas pessoas', async () => {
            contas = Array.from({ length: LOTE_DE_INSERCAO * 2 + 1 }, (_, i) => ({
                _id: `c${i}`,
                email: `p${i}@exemplo.com`,
                nome: null,
            }));

            await service.criar(
                {
                    tipo: 'aviso',
                    detalhe: 'Aviso geral.',
                    destinatarios: contas.map((c) => c._id),
                    validaAte: emUmaHora(),
                },
                ana,
            );

            expect(inseridos.map((parte) => parte.length)).toEqual([LOTE_DE_INSERCAO, LOTE_DE_INSERCAO, 1]);
            expect(new Set(inseridos.flat().map((a: any) => a.loteId)).size).toBe(1);
        });

        it('audita o tipo e quantas pessoas, nunca o texto nem quem recebeu', async () => {
            await service.criar(
                {
                    tipo: 'lembrete-exame',
                    detalhe: 'Exame de HIV amanhã.',
                    destinatarios: ['u1'],
                    validaAte: emUmaHora(),
                },
                ana,
            );

            expect(registrar).toHaveBeenCalledTimes(1);
            const registro = registrar.mock.calls[0][0];
            expect(registro).toMatchObject({
                action: 'agendar',
                entity_type: 'notificacao',
                target: 'Lembrete de exame para 1 pessoa',
            });
            const gravado = JSON.stringify(registro);
            expect(gravado).not.toContain('HIV');
            expect(gravado).not.toContain('u1');
            expect(gravado).not.toContain('bia@exemplo.com');
        });

        it.each([
            [{ detalhe: '   ', destinatarios: ['u1'] }, /texto do aviso/],
            [{ detalhe: 'Oi', destinatarios: [] }, /quem recebe/],
            [{ detalhe: 'Oi', destinatarios: ['u1'], todos: true }, /não os dois/],
            [{ detalhe: 'Oi', destinatarios: ['sumiu'] }, /não existe mais|existe mais/],
            [
                { detalhe: 'Oi', destinatarios: ['u1'], validaAte: new Date(Date.now() - 1000).toISOString() },
                /15 minutos/,
            ],
        ])('recusa %j sem gravar nada', async (dados, mensagem) => {
            const tentativa = service.criar(
                { tipo: 'aviso', validaAte: emUmaHora(), ...dados } as any,
                ana,
            );

            await expect(tentativa).rejects.toBeInstanceOf(BadRequestException);
            await expect(tentativa).rejects.toThrow(mensagem);
            expect(insertMany).not.toHaveBeenCalled();
            expect(registrar).not.toHaveBeenCalled();
        });

        it('cancela o que entrou quando a gravacao falha no meio', async () => {
            contas = Array.from({ length: LOTE_DE_INSERCAO + 1 }, (_, i) => ({
                _id: `c${i}`,
                email: `p${i}@exemplo.com`,
                nome: null,
            }));
            insertMany
                .mockImplementationOnce(async (docs: any[]) => {
                    inseridos.push(docs);
                })
                .mockRejectedValueOnce(new Error('conexão caiu'));

            const tentativa = service.criar(
                {
                    tipo: 'aviso',
                    detalhe: 'Aviso geral.',
                    destinatarios: contas.map((c) => c._id),
                    validaAte: emUmaHora(),
                },
                ana,
            );

            await expect(tentativa).rejects.toBeInstanceOf(ServiceUnavailableException);
            const loteId = inseridos[0][0].loteId;
            expect(updateMany).toHaveBeenCalledWith(
                { loteId, estado: 'pendente' },
                { $set: expect.objectContaining({ estado: 'cancelada' }) },
            );
            expect(registrar).not.toHaveBeenCalled();
        });
    });

    describe('cancelar', () => {
        it('cancela so os pendentes e deixa o TTL apagar depois', async () => {
            avisosDoLote = [{ tipo: 'lembrete-consulta' }];

            const r = await service.cancelar('lote-1', ana);

            expect(r).toEqual({ canceladas: 2 });
            const [filtro, alteracao] = updateMany.mock.calls[0];
            expect(filtro).toEqual({ loteId: 'lote-1', estado: 'pendente' });
            expect(alteracao.$set).toMatchObject({ estado: 'cancelada', travadaAte: null });
            expect(alteracao.$set.expiraEm.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
            expect(registrar.mock.calls[0][0]).toMatchObject({
                action: 'cancelar',
                target: 'Lembrete de consulta (2 pendentes)',
            });
        });

        it('nao audita quando nao havia nada pendente', async () => {
            avisosDoLote = [{ tipo: 'aviso' }];
            updateMany.mockReturnValueOnce({ exec: jest.fn(async () => ({ modifiedCount: 0 })) });

            expect(await service.cancelar('lote-1', ana)).toEqual({ canceladas: 0 });
            expect(registrar).not.toHaveBeenCalled();
        });

        it('responde 404 para envio que nao existe', async () => {
            await expect(service.cancelar('nao-existe', ana)).rejects.toBeInstanceOf(NotFoundException);
            expect(updateMany).not.toHaveBeenCalled();
        });
    });

    describe('lote', () => {
        it('mostra cada pessoa pelo e-mail e resume por plataforma', async () => {
            avisosDoLote = [
                {
                    usuarioId: 'u1',
                    estado: 'enviada',
                    motivo: null,
                    tentativas: 1,
                    enviadaEm: new Date(),
                    exibidaEm: new Date(),
                    abertaEm: null,
                    entregas: [
                        {
                            inscricaoId: 'i1',
                            resultado: 'enviada',
                            codigo: 201,
                            em: new Date(),
                            userAgent: android,
                            exibidaEm: new Date(),
                            abertaEm: null,
                        },
                    ],
                },
                { usuarioId: 'apagada', estado: 'falhou', motivo: 'x', tentativas: 1, entregas: [] },
            ];

            const r = await service.lote('lote-1');

            expect(r.pessoas.map((p) => [p.email, p.estado])).toEqual([
                ['(conta apagada)', 'falhou'],
                ['bia@exemplo.com', 'enviada'],
            ]);
            expect(r.plataformas).toEqual([
                expect.objectContaining({ plataforma: 'Android · Chrome', aparelhos: 1, exibidas: 1 }),
            ]);
        });
    });
});
