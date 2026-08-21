import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FaqsModule } from './faqs/faqs.module';
import { ActivityModule } from './activity/activity.module';
import { GeminiModule } from './gemini/gemini.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { UserSession } from './users/entities/user-session.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // LÓGICA DO LUCIANO: dois bancos, com donos bem definidos.
    //
    // O Mongo continua dono das FAQs — a coleção faq_medicamentos é contrato
    // compartilhado com a ingestão Python e com o fluxo do n8n, e mudar isso
    // quebraria o chatbot.
    //
    // O Postgres é dono da identidade: usuários, papéis e sessões. Nenhum
    // service usa os dois: o FaqsService só precisa do id e do nome de quem
    // está logado, e os dois vêm no JWT. Os bancos se encontram num lugar só,
    // que é o guard de autenticação.
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        entities: [User, UserSession],
        migrations: [__dirname + '/database/migrations/*.js'],
        // Nunca true: o schema vem das migrations, versionado. synchronize
        // altera tabela em produção sem ninguém revisar.
        synchronize: false,
        migrationsRun: config.get<string>('DB_RUN_MIGRATIONS') === 'true',
        ssl:
          config.get<string>('DATABASE_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        retryAttempts: 3,
      }),
      inject: [ConfigService],
    }),
    GeminiModule,
    FaqsModule,
    ActivityModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
