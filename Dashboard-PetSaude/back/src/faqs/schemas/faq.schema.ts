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

    // LÓGICA DO LUCIANO: o NOME continua gravado ao lado do id de propósito.
    // Esta coleção é lida pelo n8n e pela ingestão Python, e nenhum dos dois
    // alcança o Postgres — um uuid solto ali não diria nada a ninguém.
    @Prop()
    created_by_id?: string;

    @Prop()
    updated_by_id?: string;

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

// LÓGICA DO LUCIANO: caminhos da listagem paginada. O primeiro cobre a home
// (ativas, mais recentes primeiro) e o segundo o filtro por categoria.
//
// A busca por texto continua varrendo: um $regex não ancorado não usa índice.
// Com ~2500 documentos isso são milissegundos, e um índice $text não
// resolveria — ele faz prefixo e radical, não trecho, e viraria uma segunda
// semântica de busca para manter em sincronia com o enviar_dados.py.
//
// NÃO confundir com o vector_index_3072: aquele é um Atlas Search index,
// criado pelo script Python e consumido pelo n8n. Namespaces independentes.
FaqSchema.index({ isActive: 1, updatedAt: -1 });
FaqSchema.index({ isActive: 1, category: 1, updatedAt: -1 });
