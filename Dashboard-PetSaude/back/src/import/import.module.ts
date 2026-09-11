import { Module } from '@nestjs/common';

import { CategoriasModule } from '../categorias/categorias.module';
import { FaqsModule } from '../faqs/faqs.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
    // JobsModule é global; FaqsModule exporta o FaqsService, e a importação
    // grava pelo mesmo caminho do formulário manual de propósito: normalização,
    // hash, embedding, insert e log de atividade em um lugar só.
    //
    // CategoriasModule entra porque a prévia compara o assunto de cada linha com
    // a lista oficial — e é ela que decide a grafia, no lugar do minúsculo à
    // força que a importação aplicava.
    imports: [FaqsModule, CategoriasModule],
    controllers: [ImportController],
    providers: [ImportService],
    exports: [ImportService],
})
export class ImportModule { }
