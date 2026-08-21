import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FaqsController } from './faqs.controller';
import { FaqsService } from './faqs.service';
import { ActivityModule } from '../activity/activity.module';
import { GeminiModule } from '../gemini/gemini.module';
import { Faq, FaqSchema } from './schemas/faq.schema';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Faq.name, schema: FaqSchema }]),
        ActivityModule,
        GeminiModule
    ],
    controllers: [FaqsController],
    providers: [FaqsService],
    exports: [FaqsService]
})
export class FaqsModule { }
