import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CriarNotificacaoDto } from './dto/criar-notificacao.dto';
import { NotificacoesService } from './notificacoes.service';

/**
 * Avisos push para as pessoas com conta no PWA.
 *
 * `@Roles('admin')` na classe inteira, como em Conversas: a tela mostra o
 * e-mail de quem recebe e o texto dos lembretes, que pode dizer qual exame ou
 * consulta a pessoa tem marcado.
 */
@Controller('notificacoes')
@Roles('admin')
export class NotificacoesController {
    constructor(private readonly notificacoes: NotificacoesService) { }

    // Declarada ANTES de `:loteId`, senão o Nest casaria "destinatarios" como id.
    @Get('destinatarios')
    destinatarios() {
        return this.notificacoes.destinatarios();
    }

    @Get()
    lotes() {
        return this.notificacoes.lotes();
    }

    @Get(':loteId')
    lote(@Param('loteId') loteId: string) {
        return this.notificacoes.lote(loteId);
    }

    @Post()
    criar(@Body() dto: CriarNotificacaoDto, @CurrentUser() user: AuthenticatedUser) {
        return this.notificacoes.criar(dto, { id: user.id, name: user.name });
    }

    @Post(':loteId/cancelar')
    @HttpCode(200)
    cancelar(@Param('loteId') loteId: string, @CurrentUser() user: AuthenticatedUser) {
        return this.notificacoes.cancelar(loteId, { id: user.id, name: user.name });
    }
}
