import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ListarConversasQueryDto } from '../conversas/dto/listar-conversas-query.dto';
import { CorrigirGrafiaDto, DescartarGrafiaDto, SalvarUbsDto } from './dto/ubs.dto';
import { UbsService } from './ubs.service';

/** Só admin, como Conversas: a lista de grafias mostra o que cidadãos escreveram. */
@Controller('ubs')
@Roles('admin')
export class UbsController {
    constructor(private readonly ubs: UbsService) { }

    @Get('painel')
    painel(@Query() query: ListarConversasQueryDto) {
        return this.ubs.painel(query.periodo ?? 'tudo', query.dia);
    }

    @Post('grafias/corrigir')
    corrigir(@Body() body: CorrigirGrafiaDto, @CurrentUser() user: AuthenticatedUser) {
        return this.ubs.corrigirGrafia(body.chave, body.ubsId, { id: user.id, name: user.name });
    }

    @Post('grafias/descartar')
    descartar(@Body() body: DescartarGrafiaDto, @CurrentUser() user: AuthenticatedUser) {
        return this.ubs.descartarGrafia(body.chave, { id: user.id, name: user.name });
    }

    @Post()
    criar(@Body() body: SalvarUbsDto, @CurrentUser() user: AuthenticatedUser) {
        return this.ubs.criar(body.nome, { id: user.id, name: user.name });
    }

    @Put(':id')
    renomear(@Param('id') id: string, @Body() body: SalvarUbsDto, @CurrentUser() user: AuthenticatedUser) {
        return this.ubs.renomear(id, body.nome, { id: user.id, name: user.name });
    }

    @Delete(':id')
    remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.ubs.remover(id, { id: user.id, name: user.name });
    }
}
