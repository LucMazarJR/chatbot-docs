import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

import { Sessao, SessaoDocument } from './schemas/sessao.schema';
import { Mensagem, MensagemDocument } from './schemas/mensagem.schema';
import { CONEXAO_PROTOTIPO } from './conexao';
import { ActivityService } from '../activity/activity.service';
import { inicioDoDia, intervaloDoDia } from '../comum/fuso';
import { Rodada, RodadaDocument } from '../curadoria/schemas/rodada.schema';
import { Sugestao, SugestaoDocument } from '../curadoria/schemas/sugestao.schema';

/** O mesmo texto que o PWA usa, para as duas portas de exclusão deixarem o mesmo rastro. */
export const MARCA_APAGADA = '[apagada a pedido da pessoa]';

export type Periodo = 'hoje' | '7d' | '30d' | 'dia' | 'tudo';
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
 * PWA. A lógica de agregação foi portada de pwa/src/lib/revisao.ts: se um dos
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
        @InjectModel(Sugestao.name)
        private readonly sugestaoModel: Model<SugestaoDocument>,
        @InjectModel(Rodada.name)
        private readonly rodadaModel: Model<RodadaDocument>,
        private readonly activityService: ActivityService,
    ) { }

    /**
     * Condição sobre `iniciadaEm`, ou null quando o filtro é "tudo".
     *
     * "dia" é um dia do calendário, escolhido na tela para rever um teste
     * presencial. Data inválida vale como "tudo", como os outros filtros.
     */
    private intervalo(periodo: Periodo, dia?: string): { $gte: Date; $lt?: Date } | null {
        const agora = new Date();

        // No fuso da equipe: o servidor roda em UTC (ver comum/fuso.ts).
        if (periodo === 'hoje') return { $gte: inicioDoDia(agora) };
        if (periodo === '7d') return { $gte: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000) };
        if (periodo === '30d') return { $gte: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000) };
        if (periodo === 'dia' && dia) {
            const doDia = intervaloDoDia(dia);
            if (doDia) return { $gte: doDia.inicio, $lt: doDia.fim };
        }
        return null;
    }

    /**
     * Recorte de tempo e de interface.
     *
     * Sessões antigas não têm o campo `versao`: são anteriores à existência
     * das duas interfaces. Contam como "a", que era a única que existia.
     */
    private filtroDeSessao(periodo: Periodo, versao: FiltroVersao, dia?: string): Record<string, unknown> {
        const filtro: Record<string, unknown> = {};

        const intervalo = this.intervalo(periodo, dia);
        if (intervalo) filtro.iniciadaEm = intervalo;

        if (versao === 'a') filtro.$or = [{ versao: 'a' }, { versao: { $exists: false } }];
        else if (versao === 'b') filtro.versao = 'b';

        return filtro;
    }

    /** Números do topo da tela, recortados por período e interface. */
    async estatisticas(periodo: Periodo = 'tudo', versao: FiltroVersao = 'todas', dia?: string) {
        const base = this.filtroDeSessao(periodo, versao, dia);
        const noRecorte = await this.sessaoModel.find(base).select('_id').lean().exec();
        const idsNoRecorte = noRecorte.map((s) => s._id);

        // Sessão sem pergunta nenhuma é visita, não conversa. Contá-la afundaria
        // o total e a taxa de avaliação: números que alguém lê como "quantas
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
            // Respostas que passaram de 30s: a espera virando problema de
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
        dia?: string,
        limite = 200,
    ) {
        const pipeline: PipelineStage[] = [
            { $match: this.filtroDeSessao(periodo, versao, dia) },
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

    /**
     * Apaga uma conversa a pedido de quem a teve.
     *
     * LÓGICA DO LUCIANO: é a outra porta do direito de exclusão. O próprio chat
     * já deixa a pessoa apagar a conversa, mas só enquanto ela está no aparelho.
     * Quem trocou de celular, limpou o navegador ou fez o teste no aparelho de
     * outra pessoa não tem mais como, e o pedido chega à equipe. Esta rota é
     * para esse caso.
     *
     * Faz o mesmo que o PWA, e na mesma ordem: as CÓPIAS primeiro (sugestões e
     * rodadas da curadoria), a conversa depois. Se algo falhar no meio, a
     * conversa continua na lista e o pedido pode ser repetido: na ordem inversa
     * ela sumiria da tela deixando cópias para trás.
     *
     * A auditoria registra quem apagou, quando e quantos registros, e NENHUM
     * conteúdo: guardar o texto no log de uma exclusão desfaria a exclusão.
     */
    async apagar(id: string, actor: { id?: string; name: string }) {
        const sessao = await this.sessaoModel.findById(id).select('_id').lean().exec();
        if (!sessao) throw new NotFoundException('Conversa não encontrada. Ela pode ter sido apagada pelo cidadão: volte para Conversas.');

        const sugestoes = await this.sugestaoModel
            .updateMany(
                { 'origens.sessaoId': id },
                { $set: { 'origens.$[origem].pergunta': MARCA_APAGADA } },
                { arrayFilters: [{ 'origem.sessaoId': id }] },
            )
            .exec();

        const rodadas = await this.rodadaModel
            .updateMany(
                { 'lacunas.sessaoId': id },
                {
                    $set: {
                        'lacunas.$[lacuna].pergunta': MARCA_APAGADA,
                        // Inteira, e não só o trecho: o texto do modelo pode repetir a
                        // pergunta com outras palavras, e não dá para separar com
                        // segurança. Custa a auditoria da rodada, que é o preço certo.
                        respostaBruta: MARCA_APAGADA,
                    },
                },
                { arrayFilters: [{ 'lacuna.sessaoId': id }] },
            )
            .exec();

        const mensagens = await this.mensagemModel.deleteMany({ sessaoId: id }).exec();
        await this.sessaoModel.deleteOne({ _id: id }).exec();

        const resultado = {
            mensagens: mensagens.deletedCount,
            sugestoes: sugestoes.modifiedCount,
            rodadas: rodadas.modifiedCount,
        };

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'excluir',
            entity_type: 'conversa',
            entity_id: id,
            target: 'Conversa apagada a pedido da pessoa',
            after: resultado,
        });

        return { ok: true, ...resultado };
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
