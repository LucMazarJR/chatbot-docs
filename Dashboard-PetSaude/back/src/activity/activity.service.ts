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

    async logActivity(actor_name: string, action: string, question: string | null) {
        try {
            if (action === 'editar' && question) {
                await this.activityModel.deleteMany({ action: 'editar', target: question }).exec();
            }

            const newActivity = new this.activityModel({
                actor_name: actor_name,
                action: action,
                target: question || "",
                created_at: new Date()
            });
            await newActivity.save();
        } catch (error) {
            this.logger.error(`Error logging activity: ${error.message}`);
        }
    }

    async getRecentActivities(limit: number = 15) {
        return this.activityModel
            .find()
            .sort({ created_at: -1 })
            .limit(limit)
            .exec();
    }
}
