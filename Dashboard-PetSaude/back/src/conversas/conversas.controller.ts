import { Controller, Delete, Get, Header, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permite } from '../auth/decorators/permite.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ConversasService } from './conversas.service';
import { ListarConversasQueryDto } from './dto/listar-conversas-query.dto';

/**
 * Conversas do protótipo PWA.
 *
 * Área própria, que nenhum grupo recebe por padrão a não ser o Administrador:
 * aqui há relato de sintoma e pedido de atendimento escritos por cidadãos
 * identificáveis pelo que contam. Antes desta rota, o painel vivia no próprio
 * PWA atrás de uma senha única, sem identidade e sem trilha de quem leu o quê.
 */
@Controller('conversas')
@Permite('conversas:ver')
export class ConversasController {
    constructor(private readonly conversas: ConversasService) { }

    // Declarada ANTES de qualquer rota com parâmetro, senão o Nest casaria
    // "estatisticas" e "exportar" como se fossem um id.
    @Get('estatisticas')
    estatisticas(@Query() query: ListarConversasQueryDto) {
        return this.conversas.estatisticas(query.periodo ?? 'tudo', query.versao ?? 'todas', query.dia);
    }

    // Todas as conversas de uma vez, para fora do painel: pesa mais que ler uma
    // por uma, e fica com quem pode apagar.
    @Get('exportar')
    @Permite('conversas:editar')
    @Header('Content-Type', 'text/csv; charset=utf-8')
    @Header('Content-Disposition', 'attachment; filename="conversas.csv"')
    exportar() {
        return this.conversas.exportarCsv();
    }

    @Get()
    listar(@Query() query: ListarConversasQueryDto) {
        return this.conversas.listar(
            query.situacao ?? 'validas',
            query.periodo ?? 'tudo',
            query.versao ?? 'todas',
            query.dia,
            query.page,
            query.limit,
        );
    }

    @Get(':id')
    detalhar(@Param('id') id: string) {
        return this.conversas.detalhar(id);
    }

    /** Alguém vai baixar a conversa em PDF: fica no histórico, sem conteúdo. */
    @Post(':id/exportacao')
    registrarExportacao(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.conversas.registrarExportacao(id, { id: user.id, name: user.name });
    }

    /** Pedido de exclusão que chegou à equipe por fora do chat. */
    @Delete(':id')
    @Permite('conversas:editar')
    apagar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.conversas.apagar(id, { id: user.id, name: user.name });
    }
}
