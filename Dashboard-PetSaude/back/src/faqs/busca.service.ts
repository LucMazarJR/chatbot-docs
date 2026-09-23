import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, type PipelineStage } from 'mongoose';

import { GeminiService } from '../gemini/gemini.service';
import { Faq, FaqDocument } from './schemas/faq.schema';

/**
 * O corte de relevância do chatbot.
 *
 * LÓGICA DO LUCIANO: precisa ser o MESMO número do nó "Montar contexto" dos dois
 * fluxos do n8n. Se divergir, esta tela deixa de mostrar o que o chatbot faz e
 * passa a mostrar o que ela própria faria — que é pior do que não ter a tela.
 *
 * O valor foi calibrado com 81 perguntas reais de participantes: as respondidas
 * têm melhor score médio 0,844; as que a base não sabia, 0,815. Baixar para 0,80
 * foi testado e é pior — ganham-se 2 respostas corretas e entram 8 contextos
 * irrelevantes a mais.
 */
export const LIMIAR_SCORE_PADRAO = 0.82;

/** Quantos trechos o fluxo do n8n pede por busca (`topK` do nó Vector Store). */
const TOP_K_PADRAO = 10;

export type TrechoEncontrado = {
    id: string;
    question: string;
    category: string | null;
    score: number;
    /** Se o chatbot usaria este trecho como contexto. */
    passaria: boolean;
    /** FAQ desativada que mesmo assim voltou na busca. */
    ativa: boolean;
    previa: string;
};

export type ResultadoBusca = {
    pergunta: string;
    limiar: number;
    modelo: string;
    quantosPassam: number;
    trechos: TrechoEncontrado[];
};

/**
 * Roda a mesma busca do chatbot, a pedido.
 *
 * LÓGICA DO LUCIANO: até aqui a única forma de saber por que o chatbot não
 * respondeu alguma coisa era mandar a pergunta pelo chat e esperar. Isso custa
 * minutos, depende do n8n estar de pé e não mostra os scores — dá para ver que
 * falhou, não por quanto. Quem escreve FAQ precisa do número: a diferença entre
 * "falta essa FAQ" e "a FAQ existe e ficou três milésimos abaixo do corte" muda
 * completamente o que fazer em seguida.
 */
@Injectable()
export class BuscaSemanticaService {
    private readonly logger = new Logger(BuscaSemanticaService.name);

    private readonly indice: string;
    private readonly limiar: number;

    constructor(
        @InjectModel(Faq.name) private readonly faqModel: Model<FaqDocument>,
        private readonly geminiService: GeminiService,
        configService: ConfigService,
    ) {
        this.indice = configService.get<string>('ATLAS_VECTOR_INDEX') ?? 'vector_index_3072';
        const limiarConfigurado = Number(configService.get<string>('LIMIAR_SCORE'));
        this.limiar = Number.isFinite(limiarConfigurado) && limiarConfigurado > 0
            ? limiarConfigurado
            : LIMIAR_SCORE_PADRAO;
    }

    async testar(pergunta: string, topK = TOP_K_PADRAO): Promise<ResultadoBusca> {
        const texto = pergunta.trim();

        // O vetor da pergunta sai do MESMO service que gera o das FAQs, com o
        // mesmo modelo e o mesmo task_type. É o que mantém os scores daqui
        // comparáveis aos que a base tem — embedding de modelos diferentes
        // produz número, não produz sentido.
        const vetor = await this.geminiService.gerarEmbedding(texto);

        const pipeline: PipelineStage[] = [
            {
                $vectorSearch: {
                    index: this.indice,
                    path: 'embedding',
                    queryVector: vetor,
                    // 10 candidatos por resultado é a proporção que o nó do n8n
                    // usa. Mexer aqui mudaria o recall e faria a tela divergir
                    // do chatbot em casos de fronteira, que são justamente os
                    // que se vem investigar.
                    numCandidates: topK * 10,
                    limit: topK,
                },
            },
            {
                $project: {
                    question: 1,
                    answer: 1,
                    category: 1,
                    isActive: 1,
                    text: 1,
                    score: { $meta: 'vectorSearchScore' },
                },
            },
        ];

        let linhas: {
            _id: unknown;
            question?: string;
            answer?: string;
            category?: string;
            isActive?: boolean;
            text?: string;
            score: number;
        }[];

        try {
            linhas = await this.faqModel.aggregate(pipeline).exec();
        } catch (erro) {
            // O caso comum é o índice não existir no cluster (nome trocado, ou
            // banco de outro ambiente). Devolver 500 mandaria procurar o defeito
            // no dashboard, que não tem nada a ver com isso.
            this.logger.error(
                `Busca semantica falhou: ${erro instanceof Error ? erro.message : erro}`,
            );
            throw new ServiceUnavailableException(
                `A busca por significado não respondeu. Confira se o índice "${this.indice}" ` +
                'existe no Atlas e está ativo.',
            );
        }

        const trechos: TrechoEncontrado[] = linhas.map((linha) => ({
            id: String(linha._id),
            question: linha.question ?? '',
            category: linha.category ?? null,
            score: Number(linha.score.toFixed(4)),
            passaria: linha.score >= this.limiar,
            ativa: linha.isActive !== false,
            previa: (linha.text ?? `${linha.question ?? ''}\n${linha.answer ?? ''}`)
                .trim()
                .slice(0, 240),
        }));

        return {
            pergunta: texto,
            limiar: this.limiar,
            modelo: this.geminiService.modeloAtual,
            quantosPassam: trechos.filter((t) => t.passaria).length,
            trechos,
        };
    }
}
