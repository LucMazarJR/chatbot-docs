import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { ContaPwa, ContaPwaSchema } from './schemas/conta-pwa.schema';
import { InscricaoPush, InscricaoPushSchema } from './schemas/inscricao-push.schema';
import { Notificacao, NotificacaoSchema } from './schemas/notificacao.schema';

@Module({
    imports: [
        // Tudo no banco do PWA: a fila, as contas e os aparelhos.
        MongooseModule.forFeature(
            [
                { name: Notificacao.name, schema: NotificacaoSchema },
                { name: ContaPwa.name, schema: ContaPwaSchema },
                { name: InscricaoPush.name, schema: InscricaoPushSchema },
            ],
            CONEXAO_PROTOTIPO,
        ),
        ActivityModule,
    ],
    controllers: [NotificacoesController],
    providers: [NotificacoesService],
})
export class NotificacoesModule { }
