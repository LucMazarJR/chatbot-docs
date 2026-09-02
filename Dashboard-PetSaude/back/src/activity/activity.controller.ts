import { Controller, Get, Query } from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityService } from './activity.service';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';

/**
 * Histórico de alterações.
 *
 * LÓGICA DO LUCIANO: este controller estava sem @Roles, e o RolesGuard deixa
 * passar quem só está autenticado. Ou seja: um usuário `leitor` — que por
 * definição "apenas consulta" e não pode criar nem editar nada — paginava o
 * histórico inteiro e lia quem editou o quê, com o nome completo de cada colega
 * e o texto das perguntas. Era o único endpoint com dado de pessoa identificável
 * aberto a qualquer sessão.
 */
@Controller('activity')
@Roles('admin')
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
