import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permite } from '../auth/decorators/permite.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { SetPasswordDto, UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Permite('usuarios:ver')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    listar(@Query('active') active?: string) {
        return this.usersService.listar(active === 'true');
    }

    @Post()
    @Permite('usuarios:editar')
    criar(@Body() body: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
        return this.usersService.criar(body, { id: user.id, name: user.name });
    }

    @Patch(':id')
    @Permite('usuarios:editar')
    atualizar(
        @Param('id') id: string,
        @Body() body: UpdateUserDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.usersService.atualizar(id, body, user);
    }

    @Patch(':id/password')
    @Permite('usuarios:editar')
    definirSenha(
        @Param('id') id: string,
        @Body() body: SetPasswordDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.usersService.definirSenha(id, body.newPassword, {
            id: user.id,
            name: user.name,
        });
    }

    @Patch(':id/deactivate')
    @Permite('usuarios:editar')
    desativar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.usersService.desativar(id, user);
    }
}
