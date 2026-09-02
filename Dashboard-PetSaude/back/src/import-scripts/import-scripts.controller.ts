import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateImportScriptDto } from './dto/create-import-script.dto';
import { ImportScriptsService } from './import-scripts.service';

@Controller('import-scripts')
export class ImportScriptsController {
    constructor(private readonly service: ImportScriptsService) { }

    /**
     * O script em uso, com o código.
     *
     * LÓGICA DO LUCIANO: sem @Roles, ao contrário do resto deste controller. A
     * tela de importação precisa do código para rodá-lo no navegador, e ela é
     * aberta a editor também. Não há segredo aqui: é a regra de formato, não
     * credencial — e quem pode importar já pode ver o resultado dela.
     *
     * Declarado antes de qualquer rota com parâmetro: com um @Get(':id') acima,
     * o Nest casaria "ativo" como se fosse um id.
     */
    @Get('ativo')
    buscarAtivo() {
        return this.service.buscarAtivo();
    }

    @Get()
    @Roles('admin')
    listar() {
        return this.service.listar();
    }

    @Get(':id')
    @Roles('admin')
    buscarPorId(@Param('id') id: string) {
        return this.service.buscarPorId(id);
    }

    @Post()
    @Roles('admin')
    criar(@Body() body: CreateImportScriptDto, @CurrentUser() user: AuthenticatedUser) {
        return this.service.criar(body, { id: user.id, name: user.name });
    }

    @Post(':id/ativar')
    @Roles('admin')
    ativar(@Param('id') id: string) {
        return this.service.ativar(id);
    }

    @Post('restaurar-padrao')
    @Roles('admin')
    restaurarPadrao(@CurrentUser() user: AuthenticatedUser) {
        return this.service.restaurarPadrao({ id: user.id, name: user.name });
    }
}
