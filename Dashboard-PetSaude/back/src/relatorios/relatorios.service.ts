import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { inicioDoDia } from '../comum/fuso';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { Mensagem, MensagemDocument } from '../conversas/schemas/mensagem.schema';
import { Sessao, SessaoDocument } from '../conversas/schemas/sessao.schema';
import { GeminiService } from '../gemini/gemini.service';
import { JobsService } from '../jobs/jobs.service';
import {
    type Area,
    type Classificacao,
    contarPorArea,
    contarPorCausa,
    dividirEmLotes,
    ESQUEMA_DA_SINTESE,
    ESQUEMA_DO_LOTE,
    type Escopo,
    intervaloDoDia,
    juntarEscopos,
    lerNotasDeArea,
    lerResumo,
    montarDestaques,
    type MensagemLida,
    montarPrompt,
    montarPromptDeSintese,
    parearTrocas,
    sanearClassificacao,
    sanearEscopos,
    type SessaoLida,
    calcularNumeros,
} from './montagem';
import { Relatorio, RelatorioDocument } from './schemas/relatorio.schema';

export const JOB_RELATORIO = 'relatorio-dia';

/**
 * Teto de saída de cada chamada. Um lote de 100 perguntas, com um comentário
 * curto para cada uma, fica perto de 8 mil tokens; o teto folga o suficiente
 * para o modelo nunca cortar o JSON no meio.
 */
const TETO_DE_SAIDA = 32_768;

/**
 * Passado disso sem terminar, o relatório parou no meio: a API reiniciou e o
 * trabalho em memória se perdeu. A tela precisa dizer isso, e não ficar girando.
 */
const PRAZO_PARA_TERMINAR_MS = 15 * 60 * 1000;

@Injectable()
export class RelatoriosService {
    private readonly logger = new Logger(RelatoriosService.name);

    constructor(
        @InjectModel(Mensagem.name, CONEXAO_PROTOTIPO)
        private readonly mensagemModel: Model<MensagemDocument>,
        @InjectModel(Sessao.name, CONEXAO_PROTOTIPO)
        private readonly sessaoModel: Model<SessaoDocument>,
        @InjectModel(Relatorio.name)
        private readonly relatorioModel: Model<RelatorioDocument>,
        private readonly geminiService: GeminiService,
        private readonly jobsService: JobsService,
        private readonly activityService: ActivityService,
    ) { }

    /**
     * Começa um relatório e devolve na hora; a análise continua sozinha.
     *
     * O documento nasce aqui, antes de qualquer leitura, para a tela ter o que
     * acompanhar desde o primeiro segundo.
     */
    async iniciar(data: string, actor: { id?: string; name: string }): Promise<{ id: string }> {
        let intervalo: { inicio: Date; fim: Date };
        try {
            intervalo = intervaloDoDia(data, inicioDoDia);
        } catch (erro) {
            throw new BadRequestException(erro instanceof Error ? erro.message : 'Data inválida.');
        }
        if (intervalo.inicio > new Date()) {
            throw new BadRequestException('Esse dia ainda não chegou. Escolha hoje ou um dia anterior.');
        }

        // Um de cada vez: dois relatórios ao mesmo tempo gastariam a cota em
        // dobro sobre as mesmas perguntas. O `criar` recusa com a mensagem de
        // quem já está gerando.
        const job = this.jobsService.criar(JOB_RELATORIO, 1, actor.name);

        const doc = await new this.relatorioModel({
            data,
            estado: 'rodando',
            iniciadoEm: new Date(),
            atorNome: actor.name,
            atorId: actor.id,
            modelo: this.geminiService.modeloDeTexto,
            jobId: job.id,
        }).save();

        void this.processar(doc, job.id, intervalo, actor);
        return { id: String(doc._id) };
    }

    private async processar(
        doc: RelatorioDocument,
        jobId: string,
        { inicio, fim }: { inicio: Date; fim: Date },
        actor: { id?: string; name: string },
    ): Promise<void> {
        const brutas: string[] = [];

        try {
            const mensagens = (await this.mensagemModel
                .find({ em: { $gte: inicio, $lt: fim } })
                .select('sessaoId papel texto em correlationId tipo pendente semResposta erro feedback latenciaMs trechosDebug')
                .lean()
                .exec()) as unknown as MensagemLida[];

            const idsComMensagem = [...new Set(mensagens.map((m) => m.sessaoId))];
            const sessoes = (await this.sessaoModel
                .find({
                    $or: [
                        { _id: { $in: idsComMensagem } },
                        { consentimentoEm: { $gte: inicio, $lt: fim } },
                    ],
                })
                .select('nome iniciadaEm consentimentoEm avaliacao')
                .lean()
                .exec()) as unknown as SessaoLida[];

            const trocas = parearTrocas(mensagens, inicio, fim);
            const numeros = calcularNumeros(trocas, sessoes, mensagens, inicio, fim);
            const nomePorSessao = new Map(sessoes.map((s) => [s._id, s.nome]));

            // As perguntas ficam gravadas ANTES da chamada ao modelo. Gravadas
            // depois, uma falha na chamada não deixaria registro do que foi
            // enviado, e "gerei e não aconteceu nada" é justamente o caso em que
            // alguém vai querer saber.
            doc.numeros = numeros as unknown as Record<string, unknown>;
            doc.perguntas = trocas.map((t) => ({
                perguntaId: t.perguntaId,
                respostaId: t.respostaId,
                sessaoId: t.sessaoId,
                participante: nomePorSessao.get(t.sessaoId) ?? 'Participante',
                em: t.em,
                pergunta: t.pergunta,
                situacao: t.situacao,
                feedback: t.feedback,
                latenciaMs: t.latenciaMs,
                area: null,
                publico: null,
                causa: null,
                comentario: '',
            }));
            await doc.save();

            if (trocas.length === 0) {
                await this.encerrar(doc, 'concluido');
                this.jobsService.finalizar(jobId, 'concluido', 'Nenhuma pergunta neste dia.');
                return;
            }

            const lotes = dividirEmLotes(trocas);
            this.jobsService.definirTotal(jobId, lotes.length + (lotes.length > 1 ? 1 : 0));

            const classificacoes: Classificacao[] = [];
            const escopos: Escopo[] = [];
            const notasDosLotes = new Map<Area, string[]>();
            const modelos = new Set<string>();
            let resumo = '';
            let deslocamento = 0;

            for (const lote of lotes) {
                const { dados: bruta, modelo } = await this.geminiService.gerarJsonComModelo<unknown>(
                    montarPrompt(lote),
                    ESQUEMA_DO_LOTE,
                    { maxOutputTokens: TETO_DE_SAIDA },
                );
                modelos.add(modelo);
                brutas.push(JSON.stringify(bruta));

                classificacoes.push(...sanearClassificacao(bruta, lote));
                escopos.push(...sanearEscopos(bruta, lote.length, deslocamento));
                for (const [area, nota] of lerNotasDeArea(bruta)) {
                    notasDosLotes.set(area, [...(notasDosLotes.get(area) ?? []), nota]);
                }
                if (lotes.length === 1) resumo = lerResumo(bruta);

                deslocamento += lote.length;
                this.jobsService.avancar(jobId);
            }

            const porArea = contarPorArea(trocas, classificacoes);
            let escoposFinais = escopos;
            // Com um lote só, a nota da área é a única que existe.
            let notas = new Map([...notasDosLotes].map(([area, lista]) => [area, lista[0]]));

            if (lotes.length > 1) {
                const { dados: sintese, modelo } = await this.geminiService.gerarJsonComModelo<unknown>(
                    montarPromptDeSintese(numeros, porArea, escopos, trocas, notasDosLotes),
                    ESQUEMA_DA_SINTESE,
                    { maxOutputTokens: TETO_DE_SAIDA },
                );
                modelos.add(modelo);
                brutas.push(JSON.stringify(sintese));
                escoposFinais = juntarEscopos(sintese, escopos);
                resumo = lerResumo(sintese);
                // Área que a síntese esqueceu fica com a nota da primeira parte.
                notas = new Map([...notas, ...lerNotasDeArea(sintese)]);
                this.jobsService.avancar(jobId);
            }
            for (const linha of porArea) linha.nota = notas.get(linha.area) ?? '';
            doc.destaques = montarDestaques(numeros, porArea, classificacoes);

            doc.perguntas = doc.perguntas.map((p, i) => ({ ...p, ...classificacoes[i] }));
            doc.porArea = porArea;
            doc.porCausa = contarPorCausa(classificacoes);
            doc.escopos = escoposFinais;
            doc.resumo = resumo;
            doc.respostaBruta = brutas.join('\n');
            // O modelo que de fato escreveu, e não o configurado: com a
            // sobrecarga, parte do relatório pode ter saído da reserva.
            doc.modelo = [...modelos].join(', ');
            await this.encerrar(doc, 'concluido');

            // Sem nenhuma pergunta no registro: ele diz quem acionou a IA, sobre
            // qual dia e quantas perguntas; o conteúdo está no relatório, que a
            // exclusão alcança, e o histórico dura anos.
            void this.activityService.registrar({
                actor_name: actor.name,
                actor_id: actor.id,
                action: 'relatorio',
                entity_type: 'sistema',
                entity_id: String(doc._id),
                target: `Relatório do dia ${doc.data}: ${trocas.length} perguntas analisadas por IA`,
                after: { perguntas: trocas.length, chamadas: brutas.length, modelo: doc.modelo },
            });

            this.jobsService.finalizar(jobId, 'concluido');
        } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : 'Falha inesperada.';
            doc.respostaBruta = brutas.join('\n');

            if (GeminiService.ehErroDeCota(erro)) {
                await this.encerrar(doc, 'cota_esgotada', mensagem);
                this.jobsService.finalizar(
                    jobId,
                    'cota_esgotada',
                    'A cota da API do Gemini acabou. Gere o relatório de novo amanhã, ou peça a troca da chave.',
                );
                return;
            }

            this.logger.error(`Relatório ${String(doc._id)} falhou: ${mensagem}`);
            // O texto do Google é um JSON em inglês; quem está na tela precisa
            // saber que passa sozinho e o que fazer.
            const paraATela = GeminiService.ehSobrecarga(erro)
                ? 'O Gemini está sobrecarregado agora, inclusive o modelo de reserva. Isso costuma passar em minutos: gere o relatório de novo.'
                : mensagem;
            await this.encerrar(doc, 'erro', paraATela);
            this.jobsService.finalizar(jobId, 'erro', paraATela);
        }
    }

    /** Nunca deixa a falha do registro derrubar o trabalho que ele descreve. */
    private async encerrar(
        doc: RelatorioDocument,
        estado: 'concluido' | 'erro' | 'cota_esgotada',
        erro?: string,
    ): Promise<void> {
        try {
            doc.estado = estado;
            doc.terminadoEm = new Date();
            doc.erro = erro ?? null;
            await doc.save();
        } catch (falha) {
            this.logger.error(
                `Nao foi possivel gravar o relatorio: ${falha instanceof Error ? falha.message : falha}`,
            );
        }
    }

    /** Os relatórios já gerados, sem as perguntas: a lista mostra só o essencial. */
    async listar(limite = 30) {
        const docs = await this.relatorioModel
            .find()
            .sort({ iniciadoEm: -1 })
            .limit(Math.min(100, Math.max(1, limite)))
            .select('data estado iniciadoEm terminadoEm atorNome modelo erro numeros jobId')
            .lean()
            .exec();

        return docs.map((doc) => {
            const numeros = (doc.numeros ?? {}) as { perguntas?: number; semResposta?: number };
            return {
                id: String(doc._id),
                data: doc.data,
                estado: this.estadoReal(doc),
                iniciadoEm: doc.iniciadoEm,
                terminadoEm: doc.terminadoEm ?? null,
                atorNome: doc.atorNome,
                modelo: doc.modelo ?? null,
                erro: doc.erro ?? null,
                perguntas: numeros.perguntas ?? null,
                semResposta: numeros.semResposta ?? null,
            };
        });
    }

    async detalhar(id: string) {
        if (!isValidObjectId(id)) {
            throw new NotFoundException('Relatório não encontrado. Volte para a lista de relatórios.');
        }
        const doc = await this.relatorioModel.findById(id).select('-respostaBruta').lean().exec();
        if (!doc) throw new NotFoundException('Relatório não encontrado. Volte para a lista de relatórios.');

        const estado = this.estadoReal(doc);
        const job = estado === 'rodando' && doc.jobId ? this.jobsService.doTipo(JOB_RELATORIO) : undefined;

        return {
            id: String(doc._id),
            data: doc.data,
            estado,
            iniciadoEm: doc.iniciadoEm,
            terminadoEm: doc.terminadoEm ?? null,
            atorNome: doc.atorNome,
            modelo: doc.modelo ?? null,
            erro:
                estado === 'interrompido'
                    ? 'A geração parou no meio, provavelmente porque a API reiniciou. Gere o relatório de novo.'
                    : (doc.erro ?? null),
            andamento: job && job.id === doc.jobId ? { processados: job.processados, total: job.total } : null,
            numeros: doc.numeros ?? null,
            porArea: doc.porArea ?? [],
            porCausa: doc.porCausa ?? {},
            escopos: doc.escopos ?? [],
            destaques: doc.destaques ?? [],
            resumo: doc.resumo ?? '',
            perguntas: (doc.perguntas ?? []).map((p) => ({
                perguntaId: p.perguntaId,
                sessaoId: p.sessaoId,
                participante: p.participante,
                em: p.em,
                pergunta: p.pergunta,
                situacao: p.situacao,
                feedback: p.feedback ?? null,
                latenciaMs: p.latenciaMs ?? null,
                area: p.area ?? null,
                publico: p.publico ?? null,
                causa: p.causa ?? null,
                comentario: p.comentario ?? '',
            })),
        };
    }

    /**
     * "rodando" só enquanto o trabalho existe de verdade.
     *
     * O trabalho vive em memória. Se a API reiniciar no meio, o documento
     * ficaria "rodando" para sempre e a tela, girando sem fim.
     */
    private estadoReal(doc: { estado: string; iniciadoEm: Date; jobId?: string }): string {
        if (doc.estado !== 'rodando') return doc.estado;
        const job = this.jobsService.doTipo(JOB_RELATORIO);
        const vivo = job && job.id === doc.jobId;
        const noPrazo = Date.now() - new Date(doc.iniciadoEm).getTime() < PRAZO_PARA_TERMINAR_MS;
        return vivo && noPrazo ? 'rodando' : 'interrompido';
    }
}
