import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';

// Global: auditoria e transversal. Sem isto, faqs, auth, users e
// import-scripts precisariam importar este modulo um a um.
@Global()
@Module({
    imports: [MongooseModule.forFeature([{ name: Activity.name, schema: ActivitySchema }])],
    controllers: [ActivityController],
    providers: [ActivityService],
    exports: [ActivityService],
})
export class ActivityModule { }
