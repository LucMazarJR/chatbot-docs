import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContaPwaDocument = ContaPwa & Document;

/**
 * Conta de uma pessoa no PWA, em pwa_prototipo.usuarios.
 *
 * Não confundir com o usuário do painel, que mora no Postgres. Aqui só os
 * campos que a equipe precisa para escolher quem recebe um aviso: o hash da
 * senha e o id do Google ficam de fora do schema de propósito, e por isso nunca
 * saem do banco por este caminho.
 */
@Schema({ collection: 'usuarios', timestamps: false, versionKey: false })
export class ContaPwa {
    @Prop({ type: String })
    _id: string;

    @Prop()
    email: string;

    @Prop({ type: String, default: null })
    nome: string | null;

    @Prop()
    criadoEm: Date;
}

export const ContaPwaSchema = SchemaFactory.createForClass(ContaPwa);
