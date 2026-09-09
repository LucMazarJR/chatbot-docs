import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

import { Sessao, SessaoDocument } from './schemas/sessao.schema';
import { Mensagem, MensagemDocument } from './schemas/mensagem.schema';
import { CONEXAO_PROTOTIPO } from './conexao';

export type Periodo = 'hoje' | '7d' | '30d' | 'tudo';
export type FiltroVersao = 'a' | 'b' | 'todas';
export type FiltroSituacao =
    | 'validas'
    | 'todas'
    | 'negativos'
    | 'nota-baixa'
    | 'sem-resposta'
    | 'com-erro';

/**
 * Leitura das conversas do protótipo PWA.
 *
 * O banco é outro (pwa_prototipo), e este service é só leitor: quem escreve é o
 * PWA. A lógica de agregação foi portada de pwa/src/lib/revisao.ts — se um dos
 * dois mudar, o outro precisa acompanhar até o painel do PWA ser desligado.
 *
 * As agregações são deliberadamente simples e sem paginação no servidor: a
 * validação tem escala de dezenas a centenas de sessões, e um $lookup nesse
 * volume custa milissegundos.
 */
@Injectable()
export class ConversasService {
    constructor(
        @InjectModel(Sessao.name, CONEXAO_PROTOTIPO)
        private readonly sessaoModel: Model<SessaoDocument>,
        @InjectModel(Mensagem.name, CONEXAO_PROTOTIPO)
        private readonly mensagemModel: Model<MensagemDocument>,
    ) { }

    /** Início do intervalo, ou null quando o filtro é "tudo". */
    private desde(periodo: Periodo): Date | null {
        const agora = new Date();

        if (periodo === 'hoje') {
            const inicio = new Date(agora);
            inicio.setHours(0, 0, 0, 0);
            return inicio;
        }
        if (periodo === '7d') return new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (periodo === '30d') return new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
        return null;
    }

    /**
     * Recorte de tempo e de interface.
     *
     * Sessões antigas não têm o campo `versao` — são anteriores à existência
     * das duas interfaces. Contam como "a", que era a única que existia.
     */
    private filtroDeSessao(periodo: Periodo, versao: FiltroVersao): Record<string, unknown> {
        const filtro: Record<string, unknown> = {};

        const inicio = this.desde(periodo);
        if (inicio) filtro.iniciadaEm = { $gte: inicio };

        if (versao === 'a') filtro.$or = [{ versao: 'a' }, { versao: { $exists: false } }];
        else if (versao === 'b') filtro.versao = 'b';

        return filtro;
    }

    /** Números do topo da tela, recortados por período e interface. */
    async estatisticas(periodo: Periodo = 'tudo', versao: FiltroVersao = 'todas') {
        const base = this.filtroDeSessao(periodo, versao);
        const noRecorte = await this.sessaoModel.find(base).select('_id').lean().exec();
        const idsNoRecorte = noRecorte.map((s) => s._id);

        // Sessão sem pergunta nenhuma é visita, não conversa. Contá-la afundaria
        // o total e a taxa de avaliação — números que alguém lê como "quantas
        // pessoas conversaram".
        const comPergunta: string[] = await this.mensagemModel.distinct('sessaoId', {
            sessaoId: { $in: idsNoRecorte },
            papel: 'user',
        });

        const [porSessao, porMensagem, latencias] = await Promise.all([
            this.sessaoModel
                .aggregate([
                    { $match: { _id: { $in: comPergunta } } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            avaliadas: { $sum: { $cond: [{ $ifNull: ['$avaliacao', false] }, 1, 0] } },
                            somaEstrelas: { $sum: '$avaliacao.estrelas' },
                            qtdEstrelas: {
                                $sum: { $cond: [{ $ifNull: ['$avaliacao.estrelas', false] }, 1, 0] },
                            },
                            somaNps: { $sum: '$avaliacao.nps' },
                            qtdNps: {
                                $sum: {
                                    $cond: [{ $ne: [{ $ifNull: ['$avaliacao.nps', null] }, null] }, 1, 0],
                                },
                            },
                            promotores: {
                                $sum: { $cond: [{ $gte: [{ $ifNull: ['$avaliacao.nps', -1] }, 9] }, 1, 0] },
                            },
                            detratores: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $ne: [{ $ifNull: ['$avaliacao.nps', null] }, null] },
                                                { $lte: ['$avaliacao.nps', 6] },
                                            ],
                                        },
                                        1,
                                        0,
                                    ],
                                },
                            },
                        },
                    },
                ])
                .exec(),

            this.mensagemModel
                .aggregate([
                    { $match: { sessaoId: { $in: comPergunta } } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            doBot: { $sum: { $cond: [{ $eq: ['$papel', 'bot'] }, 1, 0] } },
                            semResposta: { $sum: { $cond: ['$semResposta', 1, 0] } },
                            erros: { $sum: { $cond: ['$erro', 1, 0] } },
                            positivos: { $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] } },
                            negativos: { $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] } },
                        },
                    },
                ])
                .exec(),

            this.mensagemModel
                .find({ sessaoId: { $in: comPergunta }, papel: 'bot', latenciaMs: { $gt: 0 } })
                .select('latenciaMs')
                .lean()
                .exec(),
        ]);

        const s = porSessao[0];
        const m = porMensagem[0];
        const tempos = latencias.map((x) => x.latenciaMs ?? 0);

        return {
            sessoes: s?.total ?? 0,
            // Quantas foram descartadas por não terem pergunta nenhuma. Fica à
            // vista para ninguém achar que sumiram sessões sem explicação.
            sessoesVazias: Math.max(0, idsNoRecorte.length - (s?.total ?? 0)),
            sessoesAvaliadas: s?.avaliadas ?? 0,
            mensagens: m?.total ?? 0,
            respostas: m?.doBot ?? 0,
            notaMedia: s?.qtdEstrelas ? s.somaEstrelas / s.qtdEstrelas : null,
            npsMedio: s?.qtdNps ? s.somaNps / s.qtdNps : null,
            // NPS clássico: promotores (9-10) menos detratores (0-6), em pontos
            // percentuais. Passivos (7-8) contam só no denominador.
            npsScore: s?.qtdNps ? Math.round(((s.promotores - s.detratores) / s.qtdNps) * 100) : null,
            // A métrica central da validação: com que frequência a base não
            // respondeu.
            percentualSemResposta: m?.doBot ? (m.semResposta / m.doBot) * 100 : null,
            erros: m?.erros ?? 0,
            positivos: m?.positivos ?? 0,
            negativos: m?.negativos ?? 0,
            latenciaMedia: this.media(tempos),
            latenciaP95: this.percentil(tempos, 95),
            // Respostas que passaram de 30s — a espera virando problema de
            // experiência.
            respostasLentas: tempos.filter((t) => t >= 30_000).length,
        };
    }

    /**
     * Lista de conversas com os contadores que os filtros usam.
     *
     * Sessão sem nenhuma pergunta não é conversa: é alguém que abriu o link e
     * saiu, ou uma aba recarregada. Elas nascem em cada visita, porque a sessão
     * é criada ao carregar a página. Só aparecem no filtro "todas".
     */
    async listar(
        situacao: FiltroSituacao = 'validas',
        periodo: Periodo = 'tudo',
        versao: FiltroVersao = 'todas',
        limite = 200,
    ) {
        const pipeline: PipelineStage[] = [
            { $match: this.filtroDeSessao(periodo, versao) },
            { $sort: { iniciadaEm: -1 } },
            {
                $lookup: {
                    from: 'mensagens',
                    localField: '_id',
                    foreignField: 'sessaoId',
                    as: 'msgs',
                },
            },
            {
                $addFields: {
                    qtdMensagens: { $size: '$msgs' },
                    qtdPerguntas: {
                        $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.papel', 'user'] } } },
                    },
                    negativos: {
                        $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.feedback', 'down'] } } },
                    },
                    positivos: {
                        $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.feedback', 'up'] } } },
                    },
                    semResposta: {
                        $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.semResposta', true] } } },
                    },
                    erros: {
                        $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.erro', true] } } },
                    },
                    latenciaMaxima: { $max: '$msgs.latenciaMs' },
                },
            },
            { $project: { msgs: 0 } },
        ];

        // "todas" é o único filtro que mostra as sessões vazias.
        if (situacao !== 'todas') pipeline.push({ $match: { qtdPerguntas: { $gt: 0 } } });

        if (situacao === 'negativos') pipeline.push({ $match: { negativos: { $gt: 0 } } });
        else if (situacao === 'nota-baixa') pipeline.push({ $match: { 'avaliacao.estrelas': { $lte: 3 } } });
        else if (situacao === 'sem-resposta') pipeline.push({ $match: { semResposta: { $gt: 0 } } });
        else if (situacao === 'com-erro') pipeline.push({ $match: { erros: { $gt: 0 } } });

        // O corte vem depois dos filtros, e não junto do $sort: cortando antes,
        // um filtro estreito devolveria menos linhas do que existem só porque as
        // 200 mais recentes não continham as que interessam.
        pipeline.push({ $limit: limite });

        return this.sessaoModel.aggregate(pipeline).exec();
    }

    /** Transcrição completa, com os metadados de cada resposta. */
    async detalhar(id: string) {
        const sessao = await this.sessaoModel.findById(id).lean().exec();
        if (!sessao) return null;

        const mensagens = await this.mensagemModel
            .find({ sessaoId: id })
            .sort({ em: 1 })
            .lean()
            .exec();

        return { sessao, mensagens };
    }

    /** Uma linha por mensagem, para abrir em planilha. */
    async exportarCsv(): Promise<string> {
        const linhas = await this.mensagemModel
            .aggregate([
                { $sort: { em: 1 } },
                { $lookup: { from: 'sessoes', localField: 'sessaoId', foreignField: '_id', as: 'sessao' } },
                { $unwind: { path: '$sessao', preserveNullAndEmptyArrays: true } },
            ])
            .exec();

        const cabecalho = [
            'sessaoId', 'versao', 'participante', 'em', 'papel', 'texto',
            'latenciaMs', 'temContexto', 'qtdTrechos', 'semResposta', 'erro',
            'motivoErro', 'feedback', 'feedbackComentario', 'estrelas', 'nps', 'comentario',
        ];

        const corpo = linhas.map((l) =>
            [
                l.sessaoId,
                l.sessao?.versao ?? 'a',
                l.sessao?.nome ?? '',
                l.em instanceof Date ? l.em.toISOString() : '',
                l.papel,
                l.texto,
                l.latenciaMs ?? '',
                l.temContexto ?? '',
                l.qtdTrechos ?? '',
                l.semResposta ?? '',
                l.erro ?? '',
                l.motivoErro ?? '',
                l.feedback ?? '',
                l.feedbackComentario ?? '',
                l.sessao?.avaliacao?.estrelas ?? '',
                l.sessao?.avaliacao?.nps ?? '',
                l.sessao?.avaliacao?.comentario ?? '',
            ]
                .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"')
                .join(','),
        );

        // BOM na frente: sem ele o Excel em pt-BR abre os acentos quebrados.
        return '﻿' + [cabecalho.join(','), ...corpo].join('\r\n');
    }

    private media(valores: number[]): number | null {
        if (!valores.length) return null;
        return valores.reduce((a, b) => a + b, 0) / valores.length;
    }

    private percentil(valores: number[], p: number): number | null {
        if (!valores.length) return null;
        const ordenados = [...valores].sort((a, b) => a - b);
        const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
        return ordenados[Math.max(0, indice)];
    }
}
