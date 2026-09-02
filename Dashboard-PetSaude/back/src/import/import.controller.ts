import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { JobsService } from '../jobs/jobs.service';
import { CommitImportacaoDto, ValidarImportacaoDto } from './dto/importar.dto';
import { ImportService, JOB_IMPORTACAO } from './import.service';

@Controller('import')
@Roles('admin', 'editor')
export class ImportController {
    constructor(
        private readonly importService: ImportService,
        private readonly jobsService: JobsService,
    ) { }

    /** Classifica as linhas sem gravar nada. É o que alimenta a prévia. */
    @Post('validar')
    validar(@Body() body: ValidarImportacaoDto) {
        return this.importService.validar(body.faqs);
    }

    @Post('commit')
    commit(@Body() body: CommitImportacaoDto, @CurrentUser() user: AuthenticatedUser) {
        return this.importService.iniciarImportacao(body, { id: user.id, name: user.name });
    }

    /**
     * O job em andamento, se houver.
     *
     * LÓGICA DO LUCIANO: declarado antes de @Get(':id') de propósito — sem
     * isso o Nest casaria "andamento" como se fosse um id de job. Serve para a
     * tela reaberta (ou aberta noutro aparelho) reencontrar uma importação que
     * continua rodando, em vez de oferecer começar outra e receber um 409.
     */
    @Get('jobs/andamento')
    andamento() {
        return this.jobsService.doTipo(JOB_IMPORTACAO) ?? null;
    }

    @Get('jobs/:id')
    job(@Param('id') id: string) {
        return this.jobsService.buscar(id);
    }

    @Post('jobs/:id/parar')
    parar(@Param('id') id: string) {
        return this.jobsService.solicitarParada(id);
    }
}
