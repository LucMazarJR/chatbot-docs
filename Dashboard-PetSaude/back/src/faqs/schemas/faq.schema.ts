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

    @Prop({ type: [Number], default: [] })
    embedding: number[];
}

export const FaqSchema = SchemaFactory.createForClass(Faq);
