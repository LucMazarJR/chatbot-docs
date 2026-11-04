import { Global, Module } from '@nestjs/common';

import { JobsService } from './jobs.service';

/**
 * Global de propósito: o registro de trabalhos é um só para a aplicação
 * inteira. Registrado por módulo, cada importador teria o próprio Map e a
 * trava de "um job por tipo" não valeria nada.
 */
@Global()
@Module({
    providers: [JobsService],
    exports: [JobsService],
})
export class JobsModule { }
