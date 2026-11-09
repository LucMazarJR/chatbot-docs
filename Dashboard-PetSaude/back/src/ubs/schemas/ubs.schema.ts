import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UbsDocument = Ubs & Document;

/**
 * As unidades de saúde que o chat reconhece.
 *
 * Fica no banco das FAQs, e não no do protótipo: o do protótipo é do PWA, e
 * esta lista é da equipe, que a mantém pelo painel.
 */
@Schema({ collection: 'ubs_unidades', timestamps: false })
export class Ubs {
    /** Como aparece na tela. */
    @Prop({ required: true })
    nome: string;

    /** Forma normalizada do nome. Ver chaveDeUbs. */
    @Prop({ required: true })
    chave: string;

    /**
     * Grafias que alguém confirmou serem desta unidade, já normalizadas.
     *
     * Só entra aqui o que a equipe apontou como nome de unidade. Texto que não
     * é nome (um nome de pessoa, por exemplo) é descartado da conversa e não
     * vem para cá: esta lista sobrevive à exclusão das conversas.
     */
    @Prop({ type: [String], default: [] })
    apelidos: string[];

    @Prop()
    criadaEm: Date;

    @Prop()
    criadaPor?: string;
}

export const UbsSchema = SchemaFactory.createForClass(Ubs);

// Duas unidades com a mesma chave deixariam a identificação sem saber qual escolher.
UbsSchema.index({ chave: 1 }, { unique: true });
