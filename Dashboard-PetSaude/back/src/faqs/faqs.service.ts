import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ActivityService } from '../activity/activity.service';
import { GeminiService } from '../gemini/gemini.service';
import { Faq, FaqDocument } from './schemas/faq.schema';

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

    async createFaq(data: any, actor: { id?: string; name: string }) {
        let cat = "";
        if (data.category) {
            cat = data.category;
        } else if (data.categories && data.categories.length > 0) {
            cat = data.categories[0];
        }

        const question = data.question || "";
        const answer = data.answer || "";
        const contentHash = this.generateHash(question, answer);

        let embeddingVector: number[] = [];
        try {
            // LÓGICA DO LUCIANO: Em 'enviar_dados.py', ele junta: texto_para_embedding = f"{pergunta} {resposta}"
            // para gerar um embedding semântico abrangendo os dois!
            const textForEmbedding = `${question} ${answer}`;
            embeddingVector = await this.geminiService.gerarEmbedding(textForEmbedding);
        } catch (e) {
            // Handle gracefully if API fails (like python code)
            // or bubble up exception. The python script continued with no embedding.
            console.error("Embedding generate error:", e);
        }

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
            embedding: embeddingVector,
            text: this.montarTexto(cat, question, answer),
            created_by: actor.name,
            updated_by: actor.name,
            created_by_id: actor.id,
            updated_by_id: actor.id
        });

        const saved = await newFaq.save();
        this.activityService.logActivity(actor.name, 'inserir', saved.question, actor.id);
        return { ok: true, id: saved._id.toString() };
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

        const newContentHash = this.generateHash(newQuestion, newAnswer);

        let newEmbedding = faq.embedding;
        // Generate new embedding only if content actually changed
        if (newContentHash !== faq.content_hash) {
            try {
                const textForEmbedding = `${newQuestion} ${newAnswer}`;
                newEmbedding = await this.geminiService.gerarEmbedding(textForEmbedding);
            } catch (e) {
                console.error("Embedding generate error on update:", e);
            }
        }

        faq.question = newQuestion;
        faq.question_normalized = this.normalizeForSearch(newQuestion);
        faq.answer = newAnswer;
        faq.category = cat;
        faq.tags = newTags;
        faq.source = newSource;
        faq.content_hash = newContentHash;
        faq.embedding = newEmbedding;
        faq.text = this.montarTexto(cat, newQuestion, newAnswer);
        faq.updatedAt = new Date();
        faq.updated_by = actor.name;
        faq.updated_by_id = actor.id;

        await faq.save();
        this.activityService.logActivity(actor.name, 'editar', faq.question, actor.id);
        return { ok: true };
    }

    async deleteFaq(id: string, actor: { id?: string; name: string }) {
        const faq = await this.faqModel.findById(id).exec();
        if (!faq) throw new NotFoundException('Not found');

        // Soft delete logic: deactivate it instead of removing embedding
        faq.isActive = false;
        faq.updatedAt = new Date();
        await faq.save();

        this.activityService.logActivity(actor.name, 'excluir', faq.question, actor.id);
        return { ok: true };
    }
}
