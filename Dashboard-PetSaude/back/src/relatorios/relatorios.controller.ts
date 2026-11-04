import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { GerarRelatorioDto } from './dto/gerar-relatorio.dto';
import { RelatoriosService } from './relatorios.service';

/**
 * O relatório do dia do chatbot.
 *
 * `@Roles('admin')` pelo mesmo motivo de ConversasController: o relatório lista
 * as perguntas que cidadãos escreveram, uma por uma. Gerar também gasta cota da
 * API do Gemini.
 */
@Controller('relatorios')
@Roles('admin')
export class RelatoriosController {
    constructor(private readonly relatorios: RelatoriosService) { }

    @Post()
    gerar(@Body() body: GerarRelatorioDto, @CurrentUser() user: AuthenticatedUser) {
        return this.relatorios.iniciar(body.data, { id: user.id, name: user.name });
    }

    @Get()
    listar() {
        return this.relatorios.listar();
    }

    @Get(':id')
    detalhar(@Param('id') id: string) {
        return this.relatorios.detalhar(id);
    }
}
