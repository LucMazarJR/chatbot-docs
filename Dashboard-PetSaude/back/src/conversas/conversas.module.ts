import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ConversasController } from './conversas.controller';
import { ConversasService } from './conversas.service';
import { Sessao, SessaoSchema } from './schemas/sessao.schema';
import { Mensagem, MensagemSchema } from './schemas/mensagem.schema';
import { CONEXAO_PROTOTIPO } from './conexao';
import { ActivityModule } from '../activity/activity.module';
import { Rodada, RodadaSchema } from '../curadoria/schemas/rodada.schema';
import { Sugestao, SugestaoSchema } from '../curadoria/schemas/sugestao.schema';

@Module({
    imports: [
        MongooseModule.forFeature(
            [
                { name: Sessao.name, schema: SessaoSchema },
                { name: Mensagem.name, schema: MensagemSchema },
            ],
            CONEXAO_PROTOTIPO,
        ),
        // As cópias das perguntas que a curadoria guarda, no banco das FAQs.
        // Apagar uma conversa sem apagar essas cópias seria dar à pessoa a
        // impressão de exclusão com o texto dela ainda guardado noutro lugar.
        MongooseModule.forFeature([
            { name: Sugestao.name, schema: SugestaoSchema },
            { name: Rodada.name, schema: RodadaSchema },
        ]),
        ActivityModule,
    ],
    controllers: [ConversasController],
    providers: [ConversasService],
    exports: [ConversasService],
})
export class ConversasModule { }
