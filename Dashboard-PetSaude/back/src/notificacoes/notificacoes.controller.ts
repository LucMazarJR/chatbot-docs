import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permite } from '../auth/decorators/permite.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CriarNotificacaoDto } from './dto/criar-notificacao.dto';
import { NotificacoesService } from './notificacoes.service';

/**
 * Avisos push para as pessoas com conta no PWA.
 *
 * Ver já mostra o e-mail de quem recebeu e o texto dos lembretes, que pode dizer
 * qual exame ou consulta a pessoa tem marcado: é uma permissão dada de
 * propósito, como Conversas.
 */
@Controller('notificacoes')
@Permite('avisos:ver')
export class NotificacoesController {
    constructor(private readonly notificacoes: NotificacoesService) { }

    // Declarada ANTES de `:loteId`, senão o Nest casaria "destinatarios" como id.
    // A lista de contas só serve para escolher quem recebe: fica com quem envia.
    @Get('destinatarios')
    @Permite('avisos:editar')
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
    @Permite('avisos:editar')
    criar(@Body() dto: CriarNotificacaoDto, @CurrentUser() user: AuthenticatedUser) {
        return this.notificacoes.criar(dto, { id: user.id, name: user.name });
    }

    @Post(':loteId/cancelar')
    @Permite('avisos:editar')
    @HttpCode(200)
    cancelar(@Param('loteId') loteId: string, @CurrentUser() user: AuthenticatedUser) {
        return this.notificacoes.cancelar(loteId, { id: user.id, name: user.name });
    }
}
