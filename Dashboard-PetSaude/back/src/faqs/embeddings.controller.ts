import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { JobsService } from '../jobs/jobs.service';
import { BackfillDto, DiagnosticoDto } from './dto/backfill.dto';
import { EmbeddingsService, JOB_EMBEDDINGS } from './embeddings.service';

/**
 * Saúde vetorial da base.
 *
 * Só admin: as duas ações que existem aqui gastam a cota da API do Gemini, que
 * é diária e compartilhada com a ingestão do Drive e com o chatbot.
 */
@Controller('faqs/embeddings')
@Roles('admin')
export class EmbeddingsController {
    constructor(
        private readonly embeddings: EmbeddingsService,
        private readonly jobs: JobsService,
    ) { }

    @Get('health')
    saude() {
        return this.embeddings.saude();
    }

    /** Quantas FAQs um modo alcançaria — a tela avisa antes de gastar cota. */
    @Get('alvo')
    async alvo(@Query() query: BackfillDto) {
        return { modo: query.modo, total: await this.embeddings.contarAlvo(query.modo) };
    }

    @Post('diagnosticar')
    diagnosticar(@Body() body: DiagnosticoDto) {
        return this.embeddings.diagnosticar(body.quantidade ?? 10);
    }

    @Post('backfill')
    backfill(@Body() body: BackfillDto, @CurrentUser() user: AuthenticatedUser) {
        return this.embeddings.iniciarBackfill(body.modo, body.limite ?? 200, {
            id: user.id,
            name: user.name,
        });
    }

    @Get('job')
    job() {
        return this.jobs.doTipo(JOB_EMBEDDINGS) ?? null;
    }
}
