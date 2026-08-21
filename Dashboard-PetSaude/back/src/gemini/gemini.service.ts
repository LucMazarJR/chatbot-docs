import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/**
 * Geração de embeddings para as FAQs criadas pelo dashboard.
 *
 * LÓGICA DO LUCIANO: os três lugares que geram vetores — este service, o
 * scripts/lib/gemini_embendding.py da ingestão e o nó Embeddings do n8n —
 * precisam usar o MESMO modelo, a MESMA dimensão e o MESMO task_type.
 *
 * Divergir não gera erro em lugar nenhum: a FAQ entra no banco, o índice
 * aceita o vetor, e simplesmente nunca aparece nas buscas — ou aparece em
 * posições sem sentido. Foi o que aconteceu quando a base migrou para o
 * gemini-embedding-2 e este arquivo continuou no 001.
 */
@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private genAI: GoogleGenAI;

    /** Precisa casar com o índice vector_index_3072 do Atlas. */
    private static readonly DIMENSOES = 3072;

    private readonly modelo: string;
    private readonly taskType: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in the environment variables');
        }
        // A SDK @google/genai suporta tokens corporativos.
        this.genAI = new GoogleGenAI({ apiKey });

        // Mesmos nomes e mesmos padrões do módulo Python, para que trocar de
        // modelo signifique mexer num lugar só do .env.
        this.modelo =
            this.configService.get<string>('GEMINI_EMBEDDING_MODEL') ?? 'gemini-embedding-2';
        this.taskType =
            this.configService.get<string>('GEMINI_TASK_TYPE') ?? 'SEMANTIC_SIMILARITY';
    }

    async gerarEmbedding(texto: string): Promise<number[]> {
        if (!texto || !texto.trim()) {
            throw new Error('Text cannot be empty for embedding generation');
        }

        try {
            const result = await this.genAI.models.embedContent({
                model: this.modelo,
                contents: texto,
                config: {
                    taskType: this.taskType,
                    outputDimensionality: GeminiService.DIMENSOES,
                },
            });

            const embedding = result.embeddings?.[0]?.values || [];

            // Falha alto em vez de gravar um vetor de tamanho errado. O Mongo
            // aceitaria o documento sem reclamar e a FAQ ficaria invisível para
            // a busca — o tipo de defeito que só aparece semanas depois, quando
            // alguém nota que uma pergunta nunca é encontrada.
            if (embedding.length !== GeminiService.DIMENSOES) {
                throw new Error(
                    `Embedding com ${embedding.length} dimensões, esperado ${GeminiService.DIMENSOES}. ` +
                    `Modelo em uso: ${this.modelo}.`,
                );
            }

            return embedding;
        } catch (error) {
            this.logger.error(`Error generating embedding: ${error.message}`, error.stack);
            throw error;
        }
    }
}
