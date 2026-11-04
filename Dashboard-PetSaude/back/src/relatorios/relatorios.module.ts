import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { Mensagem, MensagemSchema } from '../conversas/schemas/mensagem.schema';
import { Sessao, SessaoSchema } from '../conversas/schemas/sessao.schema';
import { GeminiModule } from '../gemini/gemini.module';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import { Relatorio, RelatorioSchema } from './schemas/relatorio.schema';

/**
 * Lê as conversas do protótipo e grava o relatório no banco das FAQs, como a
 * curadoria: o relatório é material de trabalho da equipe de conteúdo e precisa
 * sobreviver ao fim do protótipo.
 */
@Module({
    imports: [
        MongooseModule.forFeature([{ name: Relatorio.name, schema: RelatorioSchema }]),
        MongooseModule.forFeature(
            [
                { name: Mensagem.name, schema: MensagemSchema },
                { name: Sessao.name, schema: SessaoSchema },
            ],
            CONEXAO_PROTOTIPO,
        ),
        GeminiModule,
        ActivityModule,
    ],
    controllers: [RelatoriosController],
    providers: [RelatoriosService],
})
export class RelatoriosModule { }
