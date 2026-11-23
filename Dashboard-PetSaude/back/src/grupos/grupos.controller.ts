import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permite, SoMaster } from '../auth/decorators/permite.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AtualizarGrupoDto, CriarGrupoDto } from './dto/grupo.dto';
import { GruposService } from './grupos.service';

/**
 * Os grupos de acesso ao painel.
 *
 * Ler é de quem cuida das contas: a tela de Usuários precisa da lista para
 * escolher o grupo de cada pessoa. Criar, mudar e apagar é só do master, porque
 * mudar um grupo muda o acesso de todos os membros de uma vez.
 */
@Controller('grupos')
export class GruposController {
    constructor(private readonly grupos: GruposService) { }

    @Get()
    @Permite('usuarios:ver')
    listar() {
        return this.grupos.listar();
    }

    @Post()
    @SoMaster()
    criar(@Body() body: CriarGrupoDto, @CurrentUser() user: AuthenticatedUser) {
        return this.grupos.criar(body, user);
    }

    @Put(':id')
    @SoMaster()
    atualizar(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: AtualizarGrupoDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.grupos.atualizar(id, body, user);
    }

    @Delete(':id')
    @SoMaster()
    apagar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.grupos.apagar(id, user);
    }
}
