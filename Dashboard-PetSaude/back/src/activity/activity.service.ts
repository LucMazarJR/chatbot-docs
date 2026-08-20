import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Activity, ActivityDocument } from './schemas/activity.schema';

@Injectable()
export class ActivityService {
    private readonly logger = new Logger(ActivityService.name);

    constructor(
        @InjectModel(Activity.name) private activityModel: Model<ActivityDocument>
    ) { }

    // LÓGICA DO LUCIANO: antes daqui saía um deleteMany das edições anteriores
    // da mesma FAQ, então o histórico guardava só a última — um log de auditoria
    // que apagava a própria auditoria. Com usuários e papéis entrando, saber que
    // a mesma FAQ foi editada cinco vezes, por quem e quando, é justamente o
    // ponto. A coleção passa a crescer, que é o comportamento correto de um log.
    async logActivity(
        actor_name: string,
        action: string,
        question: string | null,
        actor_id?: string,
    ) {
        try {
            const newActivity = new this.activityModel({
                actor_name: actor_name,
                actor_id: actor_id,
                action: action,
                target: question || "",
                created_at: new Date()
            });
            await newActivity.save();
        } catch (error) {
            this.logger.error(`Error logging activity: ${error.message}`);
        }
    }

    async getRecentActivities(params: { page?: number; limit?: number } = {}) {
        const page = Math.max(1, params.page ?? 1);
        const limit = Math.min(100, Math.max(1, params.limit ?? 15));

        const [docs, total] = await Promise.all([
            this.activityModel
                .find()
                .sort({ created_at: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            this.activityModel.countDocuments().exec(),
        ]);

        // O payload cru saía com _id e target, mas o front espera id e question
        // — resultado: key={item.id} undefined em toda linha e a citação da FAQ
        // renderizando vazia. Normalizado aqui, como o FaqsService já faz.
        return {
            items: docs.map((d) => {
                const doc: any = d.toObject();
                return {
                    id: doc._id.toString(),
                    actor_name: doc.actor_name,
                    actor_id: doc.actor_id || null,
                    action: doc.action,
                    question: doc.target || "",
                    created_at: doc.created_at,
                };
            }),
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }
}
