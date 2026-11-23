import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permite } from '../auth/decorators/permite.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CategoriasService } from './categorias.service';
import { AtualizarCategoriaDto } from './dto/atualizar-categoria.dto';
import { CriarCategoriaDto } from './dto/criar-categoria.dto';

/**
 * A lista oficial de assuntos.
 *
 * LER também é de quem edita FAQ, mesmo sem a área Categorias: o formulário
 * precisa das opções. DEFINIR a taxonomia é o editar de Categorias: mudar um
 * nome aqui reescreve o campo `category` de todas as perguntas daquele assunto
 * e muda o que o chatbot enxerga como tema.
 */
@Controller('categorias')
export class CategoriasController {
    constructor(private readonly categorias: CategoriasService) { }

    // Declarada ANTES de qualquer rota com parâmetro: senão o Nest casaria
    // "revisao" como se fosse um id.
    @Get('revisao')
    @Permite('categorias:ver', 'faqs:editar')
    revisao() {
        return this.categorias.revisao();
    }

    @Get()
    @Permite('categorias:ver', 'faqs:editar')
    listar(@Query('incluirInativas') incluirInativas?: string) {
        // Comparação com a string porque o ValidationPipe roda com
        // enableImplicitConversion: false, então query param chega sempre como texto.
        return this.categorias.listar(incluirInativas === 'true');
    }

    @Post()
    @Permite('categorias:editar')
    criar(@Body() body: CriarCategoriaDto, @CurrentUser() user: AuthenticatedUser) {
        return this.categorias.criar(body, { id: user.id, name: user.name });
    }

    /** Reescreve as variantes de grafia deste assunto para o nome oficial. */
    @Post(':id/normalizar')
    @Permite('categorias:editar')
    normalizar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.categorias.normalizarGrafia(id, { id: user.id, name: user.name });
    }

    @Put(':id')
    @Permite('categorias:editar')
    atualizar(
        @Param('id') id: string,
        @Body() body: AtualizarCategoriaDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.categorias.atualizar(id, body, { id: user.id, name: user.name });
    }

    @Delete(':id')
    @Permite('categorias:editar')
    remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.categorias.remover(id, { id: user.id, name: user.name });
    }
}
