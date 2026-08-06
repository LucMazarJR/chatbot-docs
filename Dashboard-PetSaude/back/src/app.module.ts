import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { FaqsModule } from './faqs/faqs.module';
import { GateModule } from './gate/gate.module';
import { ActivityModule } from './activity/activity.module';
import { GeminiModule } from './gemini/gemini.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    GeminiModule,
    FaqsModule,
    GateModule,
    ActivityModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
