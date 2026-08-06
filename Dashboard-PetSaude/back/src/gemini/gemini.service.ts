import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private genAI: GoogleGenAI;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in the environment variables');
        }
        // LÓGICA DO LUCIANO: O script original usava 'genai.configure(api_key=API_KEY)'.
        // Agora usamos a SDK @google/genai que suporta tokens corporativos AQ.
        this.genAI = new GoogleGenAI({ apiKey });
    }

    async gerarEmbedding(texto: string): Promise<number[]> {
        // LÓGICA DO LUCIANO: A função 'gerarEmbedding' do arquivo python possui esta mesma validação:
        // "if not question or not question.strip(): raise ValueError(...)"
        if (!texto || !texto.trim()) {
            throw new Error('Text cannot be empty for embedding generation');
        }

        try {
            // LÓGICA DO LUCIANO: Equivalente à chamada 'client.models.embed_content(...)' em 'gemini_embendding.py'.
            const result = await this.genAI.models.embedContent({
                model: 'gemini-embedding-001',
                contents: texto
            });

            // LÓGICA DO LUCIANO: Equivalente a extrair 'embedding_result.embeddings[0].values'
            const embedding = result.embeddings?.[0]?.values || [];
            return embedding;
        } catch (error) {
            this.logger.error(`Error generating embedding: ${error.message}`, error.stack);
            throw error;
        }
    }
}
