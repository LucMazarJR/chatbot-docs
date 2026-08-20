import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FaqDocument = Faq & Document;

@Schema({ collection: 'faq_medicamentos', timestamps: false })
// LÓGICA DO LUCIANO: O Schema do Mongoose abaixo possui tipagem 1:1 com os dados
// enviados ao Mongo pelo script 'enviar_dados.py'.
export class Faq {
    @Prop({ required: true })
    question: string;

    @Prop()
    question_normalized: string;

    @Prop({ required: true })
    answer: string;

    @Prop()
    category: string;

    @Prop({ type: [String], default: [] })
    tags: string[];

    @Prop()
    source: string;

    @Prop()
    file_id: string;

    @Prop()
    file_origin: string;

    @Prop()
    line_reference: number;

    @Prop()
    content_hash: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ default: () => new Date() })
    updatedAt: Date;

    @Prop()
    created_by?: string;

    @Prop()
    updated_by?: string;

    @Prop({ type: [Number], default: [] })
    embedding: number[];

    // LÓGICA DO LUCIANO: campo lido pelo nó Vector Store do n8n para montar o
    // `pageContent` do trecho. Sem ele o nó encontra o documento e devolve texto
    // vazio — a busca "funciona", o agente recebe nada e responde "não
    // encontrei", sem erro em lugar nenhum. Mesmo formato do enviar_dados.py.
    @Prop()
    text?: string;
}

export const FaqSchema = SchemaFactory.createForClass(Faq);
