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

    async listFaqs(): Promise<any[]> {
        const faqs = await this.faqModel.find({ isActive: true }).select('-embedding -text').sort({ updatedAt: -1 }).exec();
        return faqs.map(f => {
            const doc = f.toObject();
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
        });
    }

    async createFaq(data: any, actor: string) {
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
            created_by: actor,
            updated_by: actor
        });

        const saved = await newFaq.save();
        this.activityService.logActivity(actor, 'inserir', saved.question);
        return { ok: true, id: saved._id.toString() };
    }

    async updateFaq(id: string, data: any, actor: string) {
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
        faq.updated_by = actor;

        await faq.save();
        this.activityService.logActivity(actor, 'editar', faq.question);
        return { ok: true };
    }

    async deleteFaq(id: string, actor: string) {
        const faq = await this.faqModel.findById(id).exec();
        if (!faq) throw new NotFoundException('Not found');

        // Soft delete logic: deactivate it instead of removing embedding
        faq.isActive = false;
        faq.updatedAt = new Date();
        await faq.save();

        this.activityService.logActivity(actor, 'excluir', faq.question);
        return { ok: true };
    }
}
