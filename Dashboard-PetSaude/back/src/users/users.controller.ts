import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateUserDto } from './dto/create-user.dto';
import { SetPasswordDto, UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles('admin')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    listar(@Query('active') active?: string) {
        return this.usersService.listar(active === 'true');
    }

    @Post()
    criar(@Body() body: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
        return this.usersService.criar(body, { id: user.id, name: user.name });
    }

    @Patch(':id')
    atualizar(
        @Param('id') id: string,
        @Body() body: UpdateUserDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.usersService.atualizar(id, body, user);
    }

    @Patch(':id/password')
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
    desativar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
        return this.usersService.desativar(id, user);
    }
}
