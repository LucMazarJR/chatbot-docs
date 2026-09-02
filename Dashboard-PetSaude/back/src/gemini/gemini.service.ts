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

    /**
     * Nome do modelo em uso, para ser gravado junto do vetor.
     *
     * LÓGICA DO LUCIANO: sem isto, não há como saber depois qual modelo gerou
     * cada embedding da base — e a dimensão não responde, porque o
     * gemini-embedding-001 também produz 3072 quando pedido. É o campo
     * `embedding_model` que o scripts/reindexar_embeddings.py usa para saber o
     * que já está em dia; o dashboard passa a gravar o mesmo.
     */
    get modeloAtual(): string {
        return this.modelo;
    }

    get dimensoes(): number {
        return GeminiService.DIMENSOES;
    }

    /**
     * Verdadeiro quando o erro é a cota da API, não uma falha passageira.
     *
     * LÓGICA DO LUCIANO: mesma lista de termos do
     * scripts/lib/gemini_embendding.py. Serve para uma importação em lote parar
     * na primeira recusa por cota em vez de gravar centenas de FAQs com vetor
     * vazio — que entram no banco e o chatbot nunca encontra.
     */
    static ehErroDeCota(erro: unknown): boolean {
        // Underscore vira espaço antes da comparação. A lista de termos veio do
        // scripts/lib/gemini_embendding.py, que procura por "resource
        // exhausted" com espaço — mas o que a API devolve é o código
        // RESOURCE_EXHAUSTED, com underscore. Sem esta normalização o termo
        // nunca casa, e o único efeito visível é o lote seguir em frente
        // gravando FAQs sem vetor depois de a cota ter acabado.
        const texto = (erro instanceof Error ? erro.message : String(erro))
            .toLowerCase()
            .replace(/_/g, ' ');
        return ['rate limit', 'quota', 'resource exhausted', '429', 'limit exceeded'].some(
            (termo) => texto.includes(termo),
        );
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
