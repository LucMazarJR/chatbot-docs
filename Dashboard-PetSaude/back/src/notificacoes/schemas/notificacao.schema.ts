import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import type { Entrega, EstadoNotificacao, TipoNotificacao } from '../tipos';

export type NotificacaoDocument = Notificacao & Document;

/**
 * A fila de avisos, em pwa_prototipo.notificacoes.
 *
 * O dono do formato é o PWA (ver ../tipos.ts). Este painel cria os pendentes,
 * cancela os que ainda não saíram e lê o resto. Os índices também são do PWA
 * (`criarIndices` em pwa/src/lib/db.ts), e não são repetidos aqui para não
 * haver duas definições da mesma coleção divergindo com o tempo.
 */
@Schema({ collection: 'notificacoes', timestamps: false, versionKey: false })
export class Notificacao {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: String, default: null })
    loteId: string | null;

    @Prop()
    usuarioId: string;

    @Prop({ type: String })
    tipo: TipoNotificacao;

    @Prop()
    detalhe: string;

    @Prop()
    mostrarDetalhe: boolean;

    @Prop()
    enviarEm: Date;

    @Prop()
    validaAte: Date;

    @Prop({ type: String })
    estado: EstadoNotificacao;

    @Prop()
    tentativas: number;

    @Prop({ type: Date, default: null })
    travadaAte: Date | null;

    @Prop({ type: String, default: null })
    recibo: string | null;

    @Prop({ type: [Object], default: [] })
    entregas: Entrega[];

    @Prop({ type: String, default: null })
    motivo: string | null;

    @Prop()
    criadaEm: Date;

    @Prop()
    criadaPor: string;

    @Prop({ type: Date, default: null })
    enviadaEm: Date | null;

    @Prop({ type: Date, default: null })
    exibidaEm: Date | null;

    @Prop({ type: Date, default: null })
    abertaEm: Date | null;

    @Prop({ type: Date, default: null })
    expiraEm: Date | null;
}

export const NotificacaoSchema = SchemaFactory.createForClass(Notificacao);
