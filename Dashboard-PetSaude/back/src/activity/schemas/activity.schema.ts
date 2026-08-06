import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActivityDocument = Activity & Document;

@Schema({ collection: 'activities', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Activity {
    @Prop({ required: true })
    actor_name: string;

    @Prop({ required: true })
    action: string;

    @Prop()
    target: string;

    @Prop()
    created_at: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
