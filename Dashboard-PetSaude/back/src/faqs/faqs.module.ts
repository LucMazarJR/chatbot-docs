import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FaqsController } from './faqs.controller';
import { EmbeddingsController } from './embeddings.controller';
import { EmbeddingsService } from './embeddings.service';
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
    controllers: [FaqsController, EmbeddingsController],
    providers: [FaqsService, EmbeddingsService],
    exports: [FaqsService, EmbeddingsService]
})
export class FaqsModule { }
