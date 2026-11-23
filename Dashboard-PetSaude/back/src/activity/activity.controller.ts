import { Controller, Get, Query } from '@nestjs/common';

import { Permite } from '../auth/decorators/permite.decorator';
import { ActivityService } from './activity.service';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';

/**
 * Histórico de alterações.
 *
 * Área própria, e não aberta a qualquer sessão: o histórico mostra quem editou
 * o quê, com o nome completo de cada colega e o texto das perguntas. Já foi uma
 * rota sem restrição nenhuma, e qualquer conta de só consulta paginava tudo.
 */
@Controller('activity')
@Permite('historico:ver')
export class ActivityController {
    constructor(private activityService: ActivityService) { }

    /** Quem aparece no historico, para alimentar o filtro por pessoa. */
    @Get('atores')
    atores() {
        return this.activityService.atores();
    }

    @Get()
    getActivities(@Query() query: ListActivityQueryDto) {
        return this.activityService.getRecentActivities(query);
    }
}
