import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { Mensagem, MensagemSchema } from '../conversas/schemas/mensagem.schema';
import { FaqsModule } from '../faqs/faqs.module';
import { GeminiModule } from '../gemini/gemini.module';
import { CuradoriaController } from './curadoria.controller';
import { CuradoriaService } from './curadoria.service';
import { Sugestao, SugestaoSchema } from './schemas/sugestao.schema';

/**
 * O único módulo que fala com os DOIS bancos.
 *
 * Lê as lacunas em pwa_prototipo.mensagens e grava as sugestões em
 * ministerio_saude.sugestoes_faq. É de propósito: a conversa é dado de validação
 * e some com o protótipo; a sugestão é material da base de conteúdo e precisa
 * sobreviver a ele. O caminho de ida é o job; o de volta, a aprovação, que cria
 * a FAQ pelo mesmo createFaq do formulário manual.
 */
@Module({
    imports: [
        MongooseModule.forFeature([{ name: Sugestao.name, schema: SugestaoSchema }]),
        MongooseModule.forFeature(
            [{ name: Mensagem.name, schema: MensagemSchema }],
            CONEXAO_PROTOTIPO,
        ),
        GeminiModule,
        FaqsModule,
        ActivityModule,
    ],
    controllers: [CuradoriaController],
    providers: [CuradoriaService],
    exports: [CuradoriaService],
})
export class CuradoriaModule { }
