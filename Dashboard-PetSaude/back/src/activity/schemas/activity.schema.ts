import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActivityDocument = Activity & Document;

@Schema({ collection: 'activities', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Activity {
    @Prop({ required: true })
    actor_name: string;

    // Id do usuário autenticado, quando houver. O nome continua gravado ao lado
    // porque o log precisa ser legível sem consultar outro banco.
    @Prop()
    actor_id?: string;

    @Prop({ required: true })
    action: string;

    @Prop()
    target: string;

    @Prop()
    created_at: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// A coleção agora cresce (o log parou de se apagar) e é sempre ordenada por data.
ActivitySchema.index({ created_at: -1 });
