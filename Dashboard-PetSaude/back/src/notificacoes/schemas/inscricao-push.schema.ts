import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InscricaoPushDocument = InscricaoPush & Document;

/**
 * Um aparelho que aceitou receber avisos, em pwa_prototipo.inscricoes_push.
 *
 * O endpoint e as chaves do aparelho ficam fora do schema: o painel só precisa
 * saber quantos aparelhos cada conta tem e de que tipo. Quem envia é o PWA.
 */
@Schema({ collection: 'inscricoes_push', timestamps: false, versionKey: false })
export class InscricaoPush {
    @Prop({ type: String })
    _id: string;

    @Prop()
    usuarioId: string;

    @Prop()
    userAgent: string;

    @Prop()
    criadaEm: Date;

    @Prop({ type: Date, default: null })
    ultimoSucessoEm: Date | null;

    @Prop()
    falhasSeguidas: number;
}

export const InscricaoPushSchema = SchemaFactory.createForClass(InscricaoPush);
