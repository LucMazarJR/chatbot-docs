import { Controller, Delete, Get, Header, Param, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ConversasService } from './conversas.service';
import { ListarConversasQueryDto } from './dto/listar-conversas-query.dto';

/**
 * Conversas do protótipo PWA.
 *
 * `@Roles('admin')` na classe inteira, como em ActivityController e
 * EmbeddingsController: aqui há relato de sintoma e pedido de atendimento
 * escritos por cidadãos identificáveis pelo que contam. Antes desta rota, o
 * painel vivia no próprio PWA atrás de uma senha única, sem identidade e sem
 * trilha de quem leu o quê.
 */
@Controller('conversas')
@Roles('admin')
export class ConversasController {
    constructor(private readonly conversas: ConversasService) { }

    // Declarada ANTES de qualquer rota com parâmetro, senão o Nest casaria
    // "estatisticas" e "exportar" como se fossem um id.
    @Get('estatisticas')
    estatisticas(@Query() query: ListarConversasQueryDto) {
        return this.conversas.estatisticas(query.periodo ?? 'tudo', query.versao ?? 'todas');
    }

    @Get('exportar')
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
        );
    }

    @Get(':id')
    detalhar(@Param('id') id: string) {
        return this.conversas.detalhar(id);
    }

    /** Pedido de exclusão que chegou à equipe por fora do chat. */
    @Delete(':id')
    apagar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.conversas.apagar(id, { id: user.id, name: user.name });
    }
}
