import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module';
import { Faq, FaqSchema } from '../faqs/schemas/faq.schema';
import { CategoriasController } from './categorias.controller';
import { CategoriasService } from './categorias.service';
import { Categoria, CategoriaSchema } from './schemas/categoria.schema';

/**
 * O modelo de Faq é registrado aqui de novo, e não importado do FaqsModule, de
 * propósito: o FaqsModule vai depender DESTE (para validar categoria e montar a
 * lista de revisão), e importar de volta fecharia um ciclo. `forFeature` do
 * mesmo schema em dois módulos devolve o mesmo modelo da mesma conexão, não
 * duplica nada.
 */
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Categoria.name, schema: CategoriaSchema },
            { name: Faq.name, schema: FaqSchema },
        ]),
        ActivityModule,
    ],
    controllers: [CategoriasController],
    providers: [CategoriasService],
    exports: [CategoriasService],
})
export class CategoriasModule { }
