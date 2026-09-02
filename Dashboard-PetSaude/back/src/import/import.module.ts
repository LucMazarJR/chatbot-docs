import { Module } from '@nestjs/common';

import { FaqsModule } from '../faqs/faqs.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
    // JobsModule é global; FaqsModule exporta o FaqsService, e a importação
    // grava pelo mesmo caminho do formulário manual de propósito: normalização,
    // hash, embedding, insert e log de atividade em um lugar só.
    imports: [FaqsModule],
    controllers: [ImportController],
    providers: [ImportService],
    exports: [ImportService],
})
export class ImportModule { }
