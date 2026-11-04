import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/**
 * Geração de embeddings para as FAQs criadas pelo dashboard.
 *
 * LÓGICA DO LUCIANO: os três lugares que geram vetores (este service, o
 * scripts/lib/gemini_embendding.py da ingestão e o nó Embeddings do n8n)
 * precisam usar o MESMO modelo, a MESMA dimensão e o MESMO task_type.
 *
 * Divergir não gera erro em lugar nenhum: a FAQ entra no banco, o índice
 * aceita o vetor, e simplesmente nunca aparece nas buscas, ou aparece em
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
    private readonly modeloTexto: string;
    private readonly modeloReserva: string;

    /** Duas esperas: três tentativas no total, em pouco mais de 10 segundos. */
    private static readonly ESPERAS_ENTRE_TENTATIVAS_MS = [2_000, 8_000];

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

        // O mesmo modelo de texto que os dois fluxos do n8n usam para responder
        // ao cidadão. Não precisa ser o mesmo (a curadoria é outra tarefa, e um
        // modelo maior daria sugestões melhores), mas começar igual mantém uma
        // variável a menos entre o que se lê aqui e o que o chatbot faz lá.
        this.modeloTexto =
            this.configService.get<string>('GEMINI_TEXT_MODEL') ?? 'gemini-3.1-flash-lite';

        // A mesma reserva dos fluxos do n8n. A cota gratuita dela é pequena, e
        // por isso ela é a reserva e não o principal.
        this.modeloReserva =
            this.configService.get<string>('GEMINI_TEXT_MODEL_RESERVA') ?? 'gemini-2.5-flash-lite';
    }

    get modeloDeTexto(): string {
        return this.modeloTexto;
    }

    /**
     * Nome do modelo em uso, para ser gravado junto do vetor.
     *
     * LÓGICA DO LUCIANO: sem isto, não há como saber depois qual modelo gerou
     * cada embedding da base, e a dimensão não responde, porque o
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
     * vazio, que entram no banco e o chatbot nunca encontra.
     */
    static ehErroDeCota(erro: unknown): boolean {
        // Underscore vira espaço antes da comparação. A lista de termos veio do
        // scripts/lib/gemini_embendding.py, que procura por "resource
        // exhausted" com espaço, mas o que a API devolve é o código
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

    /**
     * Geração de texto, com a resposta já lida como JSON.
     *
     * LÓGICA DO LUCIANO: `responseMimeType: application/json` não é enfeite. Sem
     * ele o modelo devolve o JSON embrulhado numa cerca de markdown (```json),
     * às vezes com uma frase antes, e o `JSON.parse` quebra de forma
     * intermitente: funciona em nove chamadas e falha na décima, que é o pior
     * tipo de defeito para diagnosticar. Com o mime type declarado, a API
     * garante a forma.
     *
     * `temperature` baixa pelo mesmo motivo: aqui não se quer criatividade, se
     * quer que a mesma fila produza a mesma leitura.
     */
    async gerarJson<T>(
        prompt: string,
        esquema?: Record<string, unknown>,
        opcoes: { maxOutputTokens?: number } = {},
    ): Promise<T> {
        return (await this.gerarJsonComModelo<T>(prompt, esquema, opcoes)).dados;
    }

    /**
     * O mesmo que `gerarJson`, dizendo também qual modelo respondeu.
     *
     * LÓGICA DO LUCIANO: o Google responde 503 ("high demand") por minutos
     * seguidos num modelo, e foi o que derrubou o primeiro relatório do dia
     * gerado com dados reais. Os fluxos do n8n já tinham aprendido isso: três
     * tentativas e um modelo de reserva. Aqui é o mesmo desenho. Quem grava o
     * acionamento precisa saber qual modelo de fato escreveu, por isso o nome
     * volta junto.
     */
    async gerarJsonComModelo<T>(
        prompt: string,
        esquema?: Record<string, unknown>,
        opcoes: { maxOutputTokens?: number } = {},
    ): Promise<{ dados: T; modelo: string }> {
        const config = {
            temperature: 0.2,
            responseMimeType: 'application/json',
            ...(esquema ? { responseSchema: esquema } : {}),
            // Uma resposta cortada no teto chega como JSON pela metade, e o
            // erro diz "JSON inválido" em vez de "resposta longa demais".
            // Quem pede muita saída de uma vez (o relatório do dia, com um
            // comentário por pergunta) declara o teto que precisa.
            ...(opcoes.maxOutputTokens ? { maxOutputTokens: opcoes.maxOutputTokens } : {}),
        };

        let modelo = this.modeloTexto;
        let texto: string;
        try {
            texto = await this.gerarComTentativas(modelo, prompt, config);
        } catch (erro) {
            if (!GeminiService.ehSobrecarga(erro) || !this.modeloReserva || this.modeloReserva === modelo) {
                throw erro;
            }
            this.logger.warn(`${modelo} sobrecarregado; tentando o modelo de reserva ${this.modeloReserva}.`);
            modelo = this.modeloReserva;
            texto = await this.gerarComTentativas(modelo, prompt, config);
        }

        return { dados: this.lerJson<T>(texto), modelo };
    }

    /**
     * Uma chamada, repetida só quando o erro é sobrecarga passageira.
     *
     * Cota esgotada e pedido inválido não se repetem: repetir não muda a
     * resposta e, no caso da cota, só queima o que resta dela.
     */
    private async gerarComTentativas(
        modelo: string,
        prompt: string,
        config: Record<string, unknown>,
    ): Promise<string> {
        for (let tentativa = 0; ; tentativa++) {
            try {
                const resultado = await this.genAI.models.generateContent({ model: modelo, contents: prompt, config });
                const texto = (resultado.text ?? '').trim();
                if (!texto) throw new Error('O modelo devolveu resposta vazia.');
                return texto;
            } catch (erro) {
                const espera = GeminiService.ESPERAS_ENTRE_TENTATIVAS_MS[tentativa];
                if (!GeminiService.ehSobrecarga(erro) || espera === undefined) throw erro;
                await this.esperar(espera);
            }
        }
    }

    /** Separado para o teste não precisar esperar de verdade. */
    protected esperar(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Verdadeiro quando o modelo está sobrecarregado: passa sozinho.
     *
     * É outra coisa que a cota: a sobrecarga é do Google, some em minutos e
     * vale tentar de novo; a cota é nossa, só volta no dia seguinte.
     */
    static ehSobrecarga(erro: unknown): boolean {
        const texto = (erro instanceof Error ? erro.message : String(erro)).toLowerCase();
        return ['503', 'unavailable', 'overloaded', 'high demand'].some((termo) => texto.includes(termo));
    }

    private lerJson<T>(texto: string): T {
        try {
            return JSON.parse(texto) as T;
        } catch {
            // O trecho entra na mensagem porque, quando isto acontece, o que
            // veio no lugar do JSON é a única pista: costuma ser uma recusa do
            // modelo, e não um erro de formato.
            throw new Error(`O modelo não devolveu JSON válido. Começo da resposta: ${texto.slice(0, 200)}`);
        }
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
            // a busca: o tipo de defeito que só aparece semanas depois, quando
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
