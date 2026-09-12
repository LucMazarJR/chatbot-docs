import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { JobsService } from '../jobs/jobs.service';
import { CuradoriaService, JOB_CURADORIA } from './curadoria.service';
import { AprovarSugestaoDto, ListarSugestoesQueryDto } from './dto/aprovar-sugestao.dto';

/**
 * As perguntas que o chatbot não soube responder, a caminho de virar FAQ.
 *
 * `@Roles('admin')` na classe: a fila expõe o que cidadãos escreveram no chat,
 * com o id da conversa de origem — é o mesmo material de ConversasController, e
 * vale a mesma regra. Rodar a análise também gasta cota da API.
 */
@Controller('curadoria')
@Roles('admin')
export class CuradoriaController {
    constructor(
        private readonly curadoria: CuradoriaService,
        private readonly jobs: JobsService,
    ) { }

    /** Quantas lacunas esperam análise — é o contador da tela de conversas. */
    @Get('fila')
    fila() {
        return this.curadoria.contarPendentes();
    }

    /** As próximas da fila, com a pergunta e o que a busca tinha achado. */
    @Get('fila/itens')
    itens() {
        return this.curadoria.listarFila();
    }

    @Get('sugestoes')
    sugestoes(@Query() query: ListarSugestoesQueryDto) {
        return this.curadoria.listarSugestoes(query.estado ?? 'pendente');
    }

    @Get('job')
    job() {
        return this.jobs.doTipo(JOB_CURADORIA) ?? null;
    }

    /** O histórico das análises: quando, por quem, e o que entrou em cada uma. */
    @Get('rodadas')
    rodadas() {
        return this.curadoria.listarRodadas();
    }

    // Depois de 'rodadas', senão o Nest casaria a palavra como se fosse um id.
    @Get('rodadas/:id')
    rodada(@Param('id') id: string) {
        return this.curadoria.detalharRodada(id);
    }

    @Post('analisar')
    analisar(@CurrentUser() user: AuthenticatedUser) {
        return this.curadoria.iniciarRodada({ id: user.id, name: user.name });
    }

    @Post('sugestoes/:id/aprovar')
    aprovar(
        @Param('id') id: string,
        @Body() body: AprovarSugestaoDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.curadoria.aprovar(id, body, { id: user.id, name: user.name });
    }

    @Post('sugestoes/:id/descartar')
    descartar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.curadoria.descartar(id, { id: user.id, name: user.name });
    }
}
