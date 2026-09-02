import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ActivityService } from '../activity/activity.service';
import { GeminiService } from '../gemini/gemini.service';
import { Faq, FaqDocument } from './schemas/faq.schema';

/** Vetor gerado e a procedência dele, ou o motivo de não ter saído vetor. */
export type VetorGerado = {
    embedding: number[];
    embedding_model?: string;
    embedding_dim?: number;
    embedded_at?: Date;
    /** Ausente quando deu certo. `cota` quer dizer que insistir não adianta. */
    falha?: 'cota' | 'outra';
};

/**
 * De onde a FAQ veio, quando não é o formulário manual.
 *
 * LÓGICA DO LUCIANO: file_id/file_origin já existiam para distinguir a ingestão
 * do Drive da criação pelo dashboard. A importação em lote reaproveita os dois e
 * acrescenta por qual script e versão o conteúdo passou.
 */
export type OrigemFaq = {
    /** Agrupa as linhas de uma mesma importacao no historico. */
    batch_id?: string;
    file_id?: string;
    file_origin?: string;
    line_reference?: number;
    import_script_id?: string;
    import_script_version?: number;
};

@Injectable()
export class FaqsService {
    private readonly logger = new Logger(FaqsService.name);

    constructor(
        @InjectModel(Faq.name) private faqModel: Model<FaqDocument>,
        private activityService: ActivityService,
        private geminiService: GeminiService
    ) {
        // LÓGICA DO LUCIANO: a exclusão definitiva de FAQs desativadas roda a cada
        // 24h e é IRREVERSÍVEL. FAQs criadas aqui têm file_id "dashboard_manual" e
        // não existem no Google Drive — a reingestão do enviar_dados.py não as traz
        // de volta. Por isso passou a ser opt-in: só roda com FAQ_PURGE_ENABLED=true,
        // e agora registra o que apagou em vez de engolir o erro em silêncio.
        if (process.env.FAQ_PURGE_ENABLED === 'true') {
            this.logger.warn(
                'FAQ_PURGE_ENABLED=true — FAQs desativadas há mais de 7 dias serão apagadas definitivamente a cada 24h.'
            );
            setInterval(() => void this.purgarFaqsDesativadas(), 1000 * 60 * 60 * 24);
        }
    }

    /** Apaga de vez as FAQs desativadas há mais de 7 dias. Sem volta. */
    private async purgarFaqsDesativadas(): Promise<void> {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

        const filtro = { isActive: false, updatedAt: { $lte: seteDiasAtras } };

        try {
            const alvos = await this.faqModel.find(filtro).select('question file_id').exec();
            if (alvos.length === 0) return;

            const doDashboard = alvos.filter((f) => f.file_id === 'dashboard_manual').length;
            const resultado = await this.faqModel.deleteMany(filtro).exec();

            this.logger.warn(
                `Purge: ${resultado.deletedCount} FAQ(s) apagadas definitivamente (${doDashboard} criadas no dashboard, sem cópia no Drive).`
            );

            for (const faq of alvos) {
                await this.activityService
                    .logActivity('sistema (purge)', 'excluir', faq.question)
                    .catch(() => { });
            }
        } catch (erro) {
            this.logger.error(`Purge falhou: ${erro instanceof Error ? erro.message : erro}`);
        }
    }

    // LÓGICA DO LUCIANO: Equivalente a 'normalizar_para_busca(texto)' de 'enviar_dados.py'.
    // Normaliza acentos e formatação para que o n8n ou o front busquem com mais facilidade.
    private normalizeForSearch(text: string): string {
        if (!text) return "";
        let nksel = text.normalize("NFKD");
        let semAcentos = "";
        for (let i = 0; i < nksel.length; i++) {
            semAcentos += nksel[i];
            // In JS simple replace is usually enough, but here is a simple regex for accents
        }
        semAcentos = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const limpo = semAcentos.replace(/[^\w\s]/g, "");
        return limpo.replace(/\s+/g, " ").trim().toLowerCase();
    }

    // LÓGICA DO LUCIANO: mesmo formato do campo "text" gravado por 'enviar_dados.py'.
    // O assunto entra junto porque muitas perguntas são idênticas entre si
    // ("Como me preparar para o Exame?") — sem ele o agente não sabe de qual
    // assunto o trecho fala e pode responder sobre o errado.
    private montarTexto(categoria: string, pergunta: string, resposta: string): string {
        return [
            `Assunto: ${categoria}`,
            `Pergunta: ${pergunta}`,
            `Resposta: ${resposta}`,
        ].join('\n');
    }

    // LÓGICA DO LUCIANO: Parecida com 'gerar_hash_conteudo(pergunta, resposta)' em 'enviar_dados.py'.
    // Gera um MD5 para saber se o texto da resposta/pergunta foi adulterado e se é preciso recriar o embedding.
    private generateHash(pergunta: string, resposta: string): string {
        const conteudo = `${pergunta}|${resposta}`;
        return crypto.createHash('md5').update(conteudo, 'utf8').digest('hex');
    }

    /**
     * Gera o vetor da FAQ e devolve junto a procedência dele.
     *
     * LÓGICA DO LUCIANO: o texto embedado tem de ser EXATAMENTE o mesmo que vai
     * para o campo `text` — o canônico do montarTexto, com o assunto na frente.
     * Aqui se embedava `pergunta + resposta`, sem o assunto, enquanto o `text`
     * era gravado com ele. O comentário antigo dizia que isso espelhava o
     * enviar_dados.py; espelhava, antes de o script passar a embedar o canônico
     * (enviar_dados.py:297). O resultado é que toda FAQ criada pelo dashboard
     * entrava num espaço vetorial ligeiramente diferente do resto da base: o nó
     * do n8n recupera o trecho por um texto e pontua por outro. Não dá erro em
     * lugar nenhum — só ranqueia mal, que é o defeito descrito em
     * docs/proposta-rag.md.
     *
     * Não lança: a FAQ é gravada mesmo sem vetor, para não perder o conteúdo já
     * digitado. Quem chama recebe `falha` e decide — o formulário manual segue
     * em frente, a importação em lote para quando a falha é de cota.
     */
    private async gerarVetor(texto: string): Promise<VetorGerado> {
        try {
            const embedding = await this.geminiService.gerarEmbedding(texto);
            return {
                embedding,
                embedding_model: this.geminiService.modeloAtual,
                embedding_dim: embedding.length,
                embedded_at: new Date(),
            };
        } catch (erro) {
            const cota = GeminiService.ehErroDeCota(erro);
            this.logger.error(
                `Falha ao gerar embedding${cota ? ' (cota da API)' : ''}: ` +
                `${erro instanceof Error ? erro.message : String(erro)}`
            );
            return { embedding: [], falha: cota ? 'cota' : 'outra' };
        }
    }

    // LÓGICA DO LUCIANO: guarda de sanidade mínima. Pergunta e resposta iguais
    // não são um FAQ, por definição — mas nada aqui verificava isso. Foi assim
    // que uma FAQ de teste (pergunta, resposta e categoria literalmente
    // "teste") criada pelo dashboard chegou a ser indexada e citada como
    // trecho numa conversa real com um cidadão. Fica antes da chamada ao
    // Gemini nos dois métodos, para também não gastar embedding com conteúdo
    // que vai ser rejeitado.
    private assertConteudoValido(question: string, answer: string): void {
        if (question.trim().toLowerCase() === answer.trim().toLowerCase()) {
            throw new BadRequestException('A pergunta e a resposta não podem ser iguais.');
        }
    }

    /**
     * Hash do conteúdo, na mesma forma do gerar_hash_conteudo do enviar_dados.py.
     *
     * Público porque a importação em lote precisa dele antes de gravar, para
     * saber quais linhas do arquivo já estão na base. Duas implementações do
     * mesmo MD5 divergiriam em silêncio e a deduplicação pararia de funcionar
     * sem nada indicar isso.
     */
    hashDeConteudo(pergunta: string, resposta: string): string {
        return this.generateHash(pergunta, resposta);
    }

    /**
     * Quais destes hashes já existem na base — inclusive entre as desativadas.
     *
     * LÓGICA DO LUCIANO: a consulta NÃO filtra por isActive de propósito. Uma
     * FAQ excluída é desativada, não apagada; ignorá-la aqui faria a
     * importação inserir uma segunda cópia do que alguém excluiu de propósito,
     * e a base passaria a ter duas linhas com o mesmo content_hash — uma ativa
     * e uma não. Melhor a prévia dizer que a linha já existe.
     */
    async hashesExistentes(hashes: string[]): Promise<Set<string>> {
        if (hashes.length === 0) return new Set();

        const docs = await this.faqModel
            .find({ content_hash: { $in: hashes } })
            .select('content_hash')
            .lean()
            .exec();

        return new Set(docs.map((d: any) => d.content_hash as string));
    }

    /** Sentinela usada pelo front para pedir as FAQs sem categoria. */
    static readonly SEM_CATEGORIA = '__sem_categoria__';

    // LÓGICA DO LUCIANO: escapa os metacaracteres antes de virar RegExp. Sem
    // isso, um cidadão digitando "(" na busca derruba a requisição com erro de
    // regex inválida — e padrões patológicos viram um jeito barato de fazer o
    // Mongo varrer a coleção inteira.
    private escaparRegex(termo: string): string {
        return termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private montarFiltro(busca?: string, categoria?: string): Record<string, any> {
        const filtro: Record<string, any> = { isActive: true };

        if (categoria) {
            // "Sem categoria" não é o nome de uma categoria: é a ausência dela.
            filtro.category =
                categoria === FaqsService.SEM_CATEGORIA ? { $in: [null, ''] } : categoria;
        }

        // A normalização remove pontuação, então um termo só de sinais — "(" ,
        // "..." — vira string vazia. Testar o termo CRU deixava passar um
        // `new RegExp('')`, que casa com tudo: buscar "(" devolvia a coleção
        // inteira como se nenhum filtro tivesse sido aplicado. Por isso a
        // verificação é feita sobre o termo já normalizado.
        const termoNormalizado = busca ? this.normalizeForSearch(busca).trim() : '';

        if (termoNormalizado) {
            // question_normalized é gravado tanto por este service quanto pelo
            // enviar_dados.py, com a mesma normalização — por isso a busca aqui
            // ignora acento sem precisar de nenhuma máquina nova.
            const termo = this.escaparRegex(termoNormalizado);
            const padrao = new RegExp(termo, 'i');
            filtro.$or = [
                { question_normalized: padrao },
                { category: padrao },
                { tags: padrao },
            ];
        }

        return filtro;
    }

    private mapearFaq(doc: any) {
        return {
            id: doc._id.toString(), // Map _id to id for frontend compatibility
            question: doc.question,
            answer: doc.answer,
            category: doc.category,
            tags: doc.tags || [],
            categories: doc.category ? [doc.category] : [],
            source: doc.source || "",
            isActive: doc.isActive,
            updatedAt: doc.updatedAt,
            created_by: doc.created_by || null,
            updated_by: doc.updated_by || null,
        };
    }

    async listFaqs(params: { page?: number; limit?: number; search?: string; category?: string } = {}) {
        const page = Math.max(1, params.page ?? 1);
        // Teto repetido aqui de proposito: o DTO ja limita, mas o service e
        // chamado de outros lugares e nao deveria confiar em quem chama.
        const limit = Math.min(100, Math.max(1, params.limit ?? 20));
        const filtro = this.montarFiltro(params.search, params.category);

        const [docs, total] = await Promise.all([
            this.faqModel
                .find(filtro)
                .select('-embedding -text')
                // _id como criterio de desempate: a ingestao grava lotes inteiros
                // com o mesmo updatedAt, e sem ele a ordenacao varia entre
                // paginas, duplicando ou pulando linhas na virada.
                .sort({ updatedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            this.faqModel.countDocuments(filtro).exec(),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        return {
            items: docs.map((d) => this.mapearFaq(d.toObject())),
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        };
    }

    /** Contagem por categoria — substitui o agrupamento que o front fazia em memória. */
    async getCategories() {
        const grupos = await this.faqModel.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: { $ifNull: ['$category', ''] }, count: { $sum: 1 } } },
        ]).exec();

        const categorias = grupos
            .map((g) => ({
                category: g._id === '' ? 'Sem categoria' : g._id,
                count: g.count,
            }))
            // localeCompare pt-BR e nao $sort do Mongo: a ordenacao do banco e
            // por bytes e colocaria as categorias acentuadas em outro lugar.
            .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));

        return {
            categories: categorias,
            totalFaqs: categorias.reduce((soma, c) => soma + c.count, 0),
            totalCategories: categorias.length,
        };
    }

    async createFaq(data: any, actor: { id?: string; name: string }, origem?: OrigemFaq) {
        let cat = "";
        if (data.category) {
            cat = data.category;
        } else if (data.categories && data.categories.length > 0) {
            cat = data.categories[0];
        }

        const question = data.question || "";
        const answer = data.answer || "";
        this.assertConteudoValido(question, answer);
        const contentHash = this.generateHash(question, answer);

        const texto = this.montarTexto(cat, question, answer);
        const vetor = await this.gerarVetor(texto);

        // LÓGICA DO LUCIANO: Isso estrutura os dados no mesmo json "lote_arquivo.append({"
        // garantindo que os campos (question_normalized, line_reference, file_origin, tags, embedding) existam.
        const newFaq = new this.faqModel({
            question: question,
            question_normalized: this.normalizeForSearch(question),
            answer: answer,
            category: cat,
            tags: data.tags || (data.metadata?.tags || []),
            source: data.source || (data.metadata?.source || ""),
            file_id: "dashboard_manual",
            file_origin: "Manual Insertion via App",
            line_reference: 0,
            content_hash: contentHash,
            isActive: true,
            updatedAt: new Date(),
            embedding: vetor.embedding,
            embedding_model: vetor.embedding_model,
            embedding_dim: vetor.embedding_dim,
            embedded_at: vetor.embedded_at,
            embedding_content_hash: vetor.embedding.length > 0 ? contentHash : undefined,
            text: texto,
            created_by: actor.name,
            updated_by: actor.name,
            created_by_id: actor.id,
            updated_by_id: actor.id,
            ...(origem ?? {})
        });

        const saved = await newFaq.save();

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'inserir',
            entity_type: 'faq',
            entity_id: saved._id.toString(),
            target: saved.question,
            batch_id: origem?.batch_id,
        });
        return {
            ok: true,
            id: saved._id.toString(),
            semEmbedding: vetor.embedding.length === 0,
            falha: vetor.falha,
        };
    }

    async updateFaq(id: string, data: any, actor: { id?: string; name: string }) {
        const faq = await this.faqModel.findById(id).exec();
        if (!faq) throw new NotFoundException('Not found');

        const newQuestion = data.question !== undefined ? data.question : faq.question;
        const newAnswer = data.answer !== undefined ? data.answer : faq.answer;

        let cat = faq.category;
        if (data.category !== undefined) {
            cat = data.category;
        } else if (data.categories !== undefined && data.categories.length > 0) {
            cat = data.categories[0];
        }

        const newTags = data.tags !== undefined ? data.tags : (data.metadata?.tags !== undefined ? data.metadata.tags : faq.tags);
        const newSource = data.source !== undefined ? data.source : (data.metadata?.source !== undefined ? data.metadata.source : faq.source);

        // Guardado antes de sobrescrever o documento: e daqui que sai o
        // "antes" do historico, e tambem o desfazer.
        const antes = {
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            tags: [...(faq.tags ?? [])],
            source: faq.source,
        };

        this.assertConteudoValido(newQuestion, newAnswer);
        const newContentHash = this.generateHash(newQuestion, newAnswer);

        const novoTexto = this.montarTexto(cat, newQuestion, newAnswer);

        // Só re-embeda se o conteúdo mudou de verdade — o hash é a diferença
        // entre gastar uma chamada de API por edição de tag e não gastar.
        let vetor: VetorGerado | null = null;
        if (newContentHash !== faq.content_hash) {
            vetor = await this.gerarVetor(novoTexto);
        }

        faq.question = newQuestion;
        faq.question_normalized = this.normalizeForSearch(newQuestion);
        faq.answer = newAnswer;
        faq.category = cat;
        faq.tags = newTags;
        faq.source = newSource;
        faq.content_hash = newContentHash;
        if (vetor && vetor.embedding.length > 0) {
            faq.embedding = vetor.embedding;
            faq.embedding_model = vetor.embedding_model;
            faq.embedding_dim = vetor.embedding_dim;
            faq.embedded_at = vetor.embedded_at;
            faq.embedding_content_hash = newContentHash;
        }
        faq.text = novoTexto;
        faq.updatedAt = new Date();
        faq.updated_by = actor.name;
        faq.updated_by_id = actor.id;

        await faq.save();

        // So os campos que mudaram. O documento inteiro deixaria a colecao
        // enorme e a tela ilegivel, e a pergunta que importa e "o que essa
        // pessoa mudou?", nao "como estava tudo".
        const depois = {
            question: newQuestion,
            answer: newAnswer,
            category: cat,
            tags: newTags,
            source: newSource,
        };
        const mudou = (Object.keys(antes) as (keyof typeof antes)[]).filter(
            (c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]),
        );

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'editar',
            entity_type: 'faq',
            entity_id: id,
            target: faq.question,
            before: Object.fromEntries(mudou.map((c) => [c, antes[c]])),
            after: Object.fromEntries(mudou.map((c) => [c, depois[c]])),
        });

        return { ok: true };
    }

    async deleteFaq(id: string, actor: { id?: string; name: string }) {
        const faq = await this.faqModel.findById(id).exec();
        if (!faq) throw new NotFoundException('Not found');

        // Soft delete logic: deactivate it instead of removing embedding
        faq.isActive = false;
        faq.updatedAt = new Date();
        await faq.save();

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'excluir',
            entity_type: 'faq',
            entity_id: id,
            target: faq.question,
            // A FAQ some da listagem, mas nao do banco. Guardar o conteudo aqui
            // e o que permite ver o que foi excluido depois de a purga levar o
            // documento.
            before: { question: faq.question, answer: faq.answer, category: faq.category },
        });

        return { ok: true };
    }
}
