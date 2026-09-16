import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SessaoDocument = Sessao & Document;

/** Qual das duas interfaces em avaliação gerou a conversa. */
export type VersaoInterface = 'a' | 'b';

@Schema({ _id: false })
export class Avaliacao {
    @Prop({ type: Number, default: null })
    estrelas: number | null;

    @Prop({ type: Number, default: null })
    nps: number | null;

    @Prop({ type: String, default: null })
    comentario: string | null;

    @Prop()
    avaliadaEm: Date;
}

export const AvaliacaoSchema = SchemaFactory.createForClass(Avaliacao);

// Espelha 1:1 o que o protótipo PWA grava em pwa_prototipo.sessoes. O dono do
// formato é o PWA (pwa/src/lib/tipos.ts); aqui é leitura. Mudar um campo lá
// exige mudar aqui na mesma alteração.
@Schema({ collection: 'sessoes', timestamps: false })
export class Sessao {
    // O PWA gera o id como uuid string, não ObjectId.
    @Prop({ type: String })
    _id: string;

    @Prop()
    nome: string;

    // Sessões anteriores à existência das duas interfaces não têm o campo.
    // Contam como "a", que era a única que existia.
    @Prop({ type: String })
    versao: VersaoInterface;

    @Prop()
    iniciadaEm: Date;

    @Prop({ type: Date, default: null })
    encerradaEm: Date | null;

    @Prop()
    userAgent: string;

    @Prop({ type: AvaliacaoSchema, default: null })
    avaliacao: Avaliacao | null;

    /**
     * A conta dona da conversa, quando a conversa foi feita com login.
     *
     * O painel mostra só que a conversa TEM conta, nunca de quem: quem analisa
     * respostas não precisa saber de quem é o relato de saúde. O id fica aqui
     * para a tela de avisos, que precisa saber quem pode recebê-los.
     */
    @Prop({ type: String })
    usuarioId?: string;
}

export const SessaoSchema = SchemaFactory.createForClass(Sessao);

// A revisão lista sempre da mais recente para a mais antiga. O índice já é
// criado pelo PWA; declarar aqui mantém o schema honesto sobre o que ele
// espera encontrar, e é idempotente.
SessaoSchema.index({ iniciadaEm: -1 });
