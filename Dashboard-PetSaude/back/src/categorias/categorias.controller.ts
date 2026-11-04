import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CategoriasService } from './categorias.service';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';

/**
 * A lista oficial de assuntos.
 *
 * LER é para quem escreve FAQ: o formulário precisa das opções, e editor
 * cadastra FAQ. DEFINIR a taxonomia é de admin: mudar um nome aqui reescreve o
 * campo `category` de todas as perguntas daquele assunto e muda o que o chatbot
 * enxerga como tema.
 */
@Controller('categorias')
export class CategoriasController {
    constructor(private readonly categorias: CategoriasService) { }

    // Declarada ANTES de qualquer rota com parâmetro: senão o Nest casaria
    // "revisao" como se fosse um id.
    @Get('revisao')
    @Roles('admin', 'editor')
    revisao() {
        return this.categorias.revisao();
    }

    @Get()
    @Roles('admin', 'editor')
    listar(@Query('incluirInativas') incluirInativas?: string) {
        // Comparação com a string porque o ValidationPipe roda com
        // enableImplicitConversion: false, então query param chega sempre como texto.
        return this.categorias.listar(incluirInativas === 'true');
    }

    @Post()
    @Roles('admin')
    criar(@Body() body: CriarCategoriaDto, @CurrentUser() user: AuthenticatedUser) {
        return this.categorias.criar(body, { id: user.id, name: user.name });
    }

    /** Reescreve as variantes de grafia deste assunto para o nome oficial. */
    @Post(':id/normalizar')
    @Roles('admin')
    normalizar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.categorias.normalizarGrafia(id, { id: user.id, name: user.name });
    }

    @Put(':id')
    @Roles('admin')
    atualizar(
        @Param('id') id: string,
        @Body() body: AtualizarCategoriaDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.categorias.atualizar(id, body, { id: user.id, name: user.name });
    }

    @Delete(':id')
    @Roles('admin')
    remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.categorias.remover(id, { id: user.id, name: user.name });
    }
}
