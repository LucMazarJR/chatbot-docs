import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { GeminiService } from '../gemini/gemini.service';
import { JobsService } from '../jobs/jobs.service';
import { Faq, FaqDocument } from './schemas/faq.schema';

export type ModoBackfill =
    | 'faltantes'
    | 'desatualizados'
    | 'nao_registrados'
    | 'divergentes'
    | 'tudo';

export type SaudeEmbeddings = {
    modeloConfigurado: string;
    dimensaoEsperada: number;
    totalAtivas: number;
    semVetor: number;
    dimensaoErrada: number;
    vetorDesatualizado: number;
    modeloDivergente: number;
    modeloNaoRegistrado: number;
};

export type Diagnostico = {
    modeloConfigurado: string;
    amostradas: number;
    /** Similaridade de cosseno entre o vetor guardado e um novo, por FAQ. */
    similaridades: { question: string; similaridade: number }[];
    similaridadeMedia: number;
    veredito: 'mesmo_modelo' | 'modelo_diferente' | 'inconclusivo';
    explicacao: string;
};

export const JOB_EMBEDDINGS = 'backfill-embeddings';

@Injectable()
export class EmbeddingsService {
    private readonly logger = new Logger(EmbeddingsService.name);

    /** Acima disto, os vetores vieram do mesmo modelo. */
    private static readonly LIMIAR_MESMO_MODELO = 0.98;

    /** Abaixo disto, é outro modelo — não é ruído de reprocessamento. */
    private static readonly LIMIAR_MODELO_DIFERENTE = 0.9;

    constructor(
        @InjectModel(Faq.name) private readonly faqModel: Model<FaqDocument>,
        private readonly geminiService: GeminiService,
        private readonly jobsService: JobsService,
    ) { }

    /** Mesmo texto canônico do montarTexto e do enviar_dados.py. */
    private montarTexto(categoria: string, pergunta: string, resposta: string): string {
        return [
            `Assunto: ${categoria ?? ''}`,
            `Pergunta: ${pergunta ?? ''}`,
            `Resposta: ${resposta ?? ''}`,
        ].join('\n');
    }

    private filtroDoModo(modo: ModoBackfill): Record<string, any> {
        const dim = this.geminiService.dimensoes;
        const modelo = this.geminiService.modeloAtual;

        const semVetor = {
            $or: [
                { embedding: { $exists: false } },
                { embedding: null },
                { embedding: { $size: 0 } },
                { $expr: { $ne: [{ $size: { $ifNull: ['$embedding', []] } }, dim] } },
            ],
        };

        switch (modo) {
            case 'faltantes':
                return { isActive: true, ...semVetor };
            case 'desatualizados':
                // Conteúdo editado depois que o vetor foi gerado. A FAQ é
                // encontrada pelo texto antigo e mostra o novo.
                return {
                    isActive: true,
                    embedding_content_hash: { $exists: true },
                    $expr: { $ne: ['$embedding_content_hash', '$content_hash'] },
                };
            case 'nao_registrados':
                return { isActive: true, embedding_model: { $exists: false } };
            case 'divergentes':
                return {
                    isActive: true,
                    embedding_model: { $exists: true, $ne: modelo },
                };
            case 'tudo':
            default:
                return { isActive: true };
        }
    }

    /**
     * Contagens de saúde vetorial da base.
     *
     * LÓGICA DO LUCIANO: "modelo não registrado" é uma categoria própria, e não
     * está junto de "divergente", porque as duas coisas são diferentes e a
     * segunda não pode ser inferida. O campo `embedding_model` só passou a ser
     * escrito pelo reindexar_embeddings.py e por este dashboard — a maior parte
     * da base simplesmente não tem o campo. E a dimensão não responde a
     * pergunta: o gemini-embedding-001 também produz 3072 quando pedido. Quem
     * responde de verdade é o diagnóstico por amostragem, abaixo.
     */
    async saude(): Promise<SaudeEmbeddings> {
        const dim = this.geminiService.dimensoes;
        const modelo = this.geminiService.modeloAtual;

        // Um $facet só: são seis contagens sobre a mesma coleção, e seis
        // consultas separadas seriam seis idas ao Atlas para montar uma tela.
        const [resultado] = await this.faqModel
            .aggregate([
                { $match: { isActive: true } },
                {
                    $facet: {
                        totalAtivas: [{ $count: 'n' }],
                        semVetor: [
                            {
                                $match: {
                                    $or: [
                                        { embedding: { $exists: false } },
                                        { embedding: null },
                                        { embedding: { $size: 0 } },
                                    ],
                                },
                            },
                            { $count: 'n' },
                        ],
                        dimensaoErrada: [
                            {
                                $match: {
                                    embedding: { $exists: true, $ne: null },
                                    $expr: {
                                        $and: [
                                            { $gt: [{ $size: { $ifNull: ['$embedding', []] } }, 0] },
                                            { $ne: [{ $size: { $ifNull: ['$embedding', []] } }, dim] },
                                        ],
                                    },
                                },
                            },
                            { $count: 'n' },
                        ],
                        vetorDesatualizado: [
                            {
                                $match: {
                                    embedding_content_hash: { $exists: true },
                                    $expr: { $ne: ['$embedding_content_hash', '$content_hash'] },
                                },
                            },
                            { $count: 'n' },
                        ],
                        modeloDivergente: [
                            { $match: { embedding_model: { $exists: true, $ne: modelo } } },
                            { $count: 'n' },
                        ],
                        modeloNaoRegistrado: [
                            { $match: { embedding_model: { $exists: false } } },
                            { $count: 'n' },
                        ],
                    },
                },
            ])
            .exec();

        const conta = (chave: string) => Number(resultado?.[chave]?.[0]?.n ?? 0);

        return {
            modeloConfigurado: modelo,
            dimensaoEsperada: dim,
            totalAtivas: conta('totalAtivas'),
            semVetor: conta('semVetor'),
            dimensaoErrada: conta('dimensaoErrada'),
            vetorDesatualizado: conta('vetorDesatualizado'),
            modeloDivergente: conta('modeloDivergente'),
            modeloNaoRegistrado: conta('modeloNaoRegistrado'),
        };
    }

    private cosseno(a: number[], b: number[]): number {
        let produto = 0;
        let normaA = 0;
        let normaB = 0;
        for (let i = 0; i < a.length; i++) {
            produto += a[i] * b[i];
            normaA += a[i] * a[i];
            normaB += b[i] * b[i];
        }
        if (normaA === 0 || normaB === 0) return 0;
        return produto / (Math.sqrt(normaA) * Math.sqrt(normaB));
    }

    /**
     * Descobre em que modelo a base realmente está, re-embedando uma amostra.
     *
     * LÓGICA DO LUCIANO: é a única forma honesta de responder "a base está no
     * gemini-embedding-2 ou ainda no 001?". O campo `embedding_model` está
     * ausente na maior parte dos documentos e a dimensão não distingue os dois.
     * Aqui se gera um vetor novo para uma amostra e se compara com o guardado:
     * se vieram do mesmo modelo, o cosseno fica praticamente em 1.
     *
     * Custa uma chamada de API por FAQ amostrada. Dez respondem a pergunta.
     */
    async diagnosticar(quantidade = 10): Promise<Diagnostico> {
        const dim = this.geminiService.dimensoes;

        const docs = await this.faqModel
            .aggregate([
                {
                    $match: {
                        isActive: true,
                        embedding: { $exists: true, $ne: null },
                        $expr: { $eq: [{ $size: { $ifNull: ['$embedding', []] } }, dim] },
                    },
                },
                // Amostra aleatória: pegar os primeiros pegaria um lote só, e um
                // lote inteiro costuma ter vindo do mesmo dia e do mesmo modelo.
                { $sample: { size: Math.max(1, Math.min(50, quantidade)) } },
                { $project: { question: 1, answer: 1, category: 1, text: 1, embedding: 1 } },
            ])
            .exec();

        if (docs.length === 0) {
            return {
                modeloConfigurado: this.geminiService.modeloAtual,
                amostradas: 0,
                similaridades: [],
                similaridadeMedia: 0,
                veredito: 'inconclusivo',
                explicacao:
                    'Nenhuma FAQ ativa tem vetor com a dimensao esperada. Nao ha o que comparar.',
            };
        }

        const similaridades: { question: string; similaridade: number }[] = [];

        for (const doc of docs) {
            const texto =
                doc.text || this.montarTexto(doc.category, doc.question, doc.answer);
            try {
                const novo = await this.geminiService.gerarEmbedding(texto);
                similaridades.push({
                    question: doc.question,
                    similaridade: Number(this.cosseno(doc.embedding, novo).toFixed(4)),
                });
            } catch (erro) {
                if (GeminiService.ehErroDeCota(erro)) break;
                this.logger.warn(
                    `Amostra ignorada: ${erro instanceof Error ? erro.message : erro}`,
                );
            }
        }

        if (similaridades.length === 0) {
            return {
                modeloConfigurado: this.geminiService.modeloAtual,
                amostradas: 0,
                similaridades: [],
                similaridadeMedia: 0,
                veredito: 'inconclusivo',
                explicacao:
                    'Nao foi possivel gerar nenhum vetor de comparacao — provavelmente a cota da API acabou.',
            };
        }

        const media =
            similaridades.reduce((s, x) => s + x.similaridade, 0) / similaridades.length;

        let veredito: Diagnostico['veredito'];
        let explicacao: string;
        if (media >= EmbeddingsService.LIMIAR_MESMO_MODELO) {
            veredito = 'mesmo_modelo';
            explicacao =
                `Os vetores guardados batem com os que ${this.geminiService.modeloAtual} ` +
                'gera agora. A base ja esta no modelo configurado.';
        } else if (media < EmbeddingsService.LIMIAR_MODELO_DIFERENTE) {
            veredito = 'modelo_diferente';
            explicacao =
                'Os vetores guardados sao bem diferentes dos que o modelo configurado gera. ' +
                'A base foi indexada com outro modelo — vale reindexar antes de confiar na busca.';
        } else {
            veredito = 'inconclusivo';
            explicacao =
                'A semelhanca ficou numa faixa intermediaria. Pode ser diferenca de texto ' +
                'canonico (FAQs antigas embedadas sem o assunto na frente) e nao de modelo. ' +
                'Amostrar mais FAQs ajuda a decidir.';
        }

        return {
            modeloConfigurado: this.geminiService.modeloAtual,
            amostradas: similaridades.length,
            similaridades,
            similaridadeMedia: Number(media.toFixed(4)),
            veredito,
            explicacao,
        };
    }

    /** Quantas FAQs cada modo de backfill alcançaria, para a tela avisar antes. */
    async contarAlvo(modo: ModoBackfill): Promise<number> {
        return this.faqModel.countDocuments(this.filtroDoModo(modo)).exec();
    }

    async iniciarBackfill(
        modo: ModoBackfill,
        limite: number,
        actor: { id?: string; name: string },
    ) {
        const alvo = Math.max(1, Math.min(2000, limite));
        const total = Math.min(alvo, await this.contarAlvo(modo));

        const job = this.jobsService.criar(JOB_EMBEDDINGS, total, actor.name);
        void this.processar(job.id, modo, alvo);

        return { jobId: job.id, total, modo };
    }

    private async processar(jobId: string, modo: ModoBackfill, limite: number): Promise<void> {
        try {
            const docs = await this.faqModel
                .find(this.filtroDoModo(modo))
                .select('question answer category content_hash')
                .limit(limite)
                .exec();

            for (const doc of docs) {
                if (this.jobsService.foiPedidoParar(jobId)) {
                    this.jobsService.finalizar(
                        jobId,
                        'parado',
                        'Interrompido a pedido. Rodar de novo retoma de onde parou.',
                    );
                    return;
                }

                // Reconstrói o texto canônico em vez de reaproveitar o campo
                // `text` guardado: se o conteúdo foi editado e o `text` ficou
                // para trás, reaproveitá-lo geraria um vetor novo para o texto
                // errado — que é exatamente o defeito que este backfill existe
                // para corrigir.
                const texto = this.montarTexto(doc.category, doc.question, doc.answer);

                try {
                    const embedding = await this.geminiService.gerarEmbedding(texto);

                    await this.faqModel
                        .updateOne(
                            { _id: doc._id },
                            {
                                $set: {
                                    embedding,
                                    text: texto,
                                    embedding_model: this.geminiService.modeloAtual,
                                    embedding_dim: embedding.length,
                                    embedded_at: new Date(),
                                    embedding_content_hash: doc.content_hash,
                                },
                            },
                        )
                        .exec();

                    this.jobsService.incrementar(jobId, 'atualizadas');
                    this.jobsService.avancar(jobId);
                } catch (erro) {
                    if (GeminiService.ehErroDeCota(erro)) {
                        this.jobsService.finalizar(
                            jobId,
                            'cota_esgotada',
                            'A cota da API do Gemini acabou. Rode de novo amanha — o alvo e ' +
                            'recalculado a cada execucao, entao retoma de onde parou.',
                        );
                        return;
                    }
                    this.jobsService.incrementar(jobId, 'falhas');
                    this.jobsService.registrarErro(jobId, {
                        linha: 0,
                        mensagem: `"${doc.question}": ${erro instanceof Error ? erro.message : erro}`,
                    });
                    this.jobsService.avancar(jobId);
                }
            }

            this.jobsService.finalizar(jobId, 'concluido');
        } catch (erro) {
            this.logger.error(
                `Backfill ${jobId} falhou: ${erro instanceof Error ? erro.message : erro}`,
            );
            this.jobsService.finalizar(
                jobId,
                'erro',
                erro instanceof Error ? erro.message : 'Falha inesperada.',
            );
        }
    }
}
