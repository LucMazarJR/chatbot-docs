import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { Mensagem, MensagemSchema } from '../conversas/schemas/mensagem.schema';
import { Sessao, SessaoSchema } from '../conversas/schemas/sessao.schema';
import { Ubs, UbsSchema } from './schemas/ubs.schema';
import { UbsController } from './ubs.controller';
import { UbsService } from './ubs.service';

/**
 * Os modelos das conversas são registrados aqui de novo, e não importados do
 * ConversasModule: ele depende DESTE para pôr o nome da UBS na lista, e importar
 * de volta fecharia um ciclo.
 */
@Module({
    imports: [
        MongooseModule.forFeature([{ name: Ubs.name, schema: UbsSchema }]),
        MongooseModule.forFeature(
            [
                { name: Sessao.name, schema: SessaoSchema },
                { name: Mensagem.name, schema: MensagemSchema },
            ],
            CONEXAO_PROTOTIPO,
        ),
        ActivityModule,
    ],
    controllers: [UbsController],
    providers: [UbsService],
    exports: [UbsService],
})
export class UbsModule { }
