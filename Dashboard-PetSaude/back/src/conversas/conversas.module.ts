import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ConversasController } from './conversas.controller';
import { ConversasService } from './conversas.service';
import { Sessao, SessaoSchema } from './schemas/sessao.schema';
import { Mensagem, MensagemSchema } from './schemas/mensagem.schema';
import { CONEXAO_PROTOTIPO } from './conexao';

@Module({
    imports: [
        MongooseModule.forFeature(
            [
                { name: Sessao.name, schema: SessaoSchema },
                { name: Mensagem.name, schema: MensagemSchema },
            ],
            CONEXAO_PROTOTIPO,
        ),
    ],
    controllers: [ConversasController],
    providers: [ConversasService],
    exports: [ConversasService],
})
export class ConversasModule { }
