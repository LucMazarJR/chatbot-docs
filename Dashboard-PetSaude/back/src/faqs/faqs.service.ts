import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ActivityService } from '../activity/activity.service';
import { GeminiService } from '../gemini/gemini.service';
import { Faq, FaqDocument } from './schemas/faq.schema';

@Injectable()
export class FaqsService {
    constructor(
        @InjectModel(Faq.name) private faqModel: Model<FaqDocument>,
        private activityService: ActivityService,
        private geminiService: GeminiService
    ) {
        // Daily cleanup of inactive FAQs older than 7 days
        setInterval(() => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            this.faqModel.deleteMany({
                isActive: false,
                updatedAt: { $lte: sevenDaysAgo }
            }).exec().catch(() => { });
        }, 1000 * 60 * 60 * 24);
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

    // LÓGICA DO LUCIANO: Parecida com 'gerar_hash_conteudo(pergunta, resposta)' em 'enviar_dados.py'.
    // Gera um MD5 para saber se o texto da resposta/pergunta foi adulterado e se é preciso recriar o embedding.
    private generateHash(pergunta: string, resposta: string): string {
        const conteudo = `${pergunta}|${resposta}`;
        return crypto.createHash('md5').update(conteudo, 'utf8').digest('hex');
    }

    async listFaqs(): Promise<any[]> {
        const faqs = await this.faqModel.find({ isActive: true }).sort({ updatedAt: -1 }).exec();
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
