import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    // 10 tentativas por minuto por IP: folgado para alguém errando a senha,
    // apertado para um script testando senhas em sequência.
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @Public()
    @Post('login')
    login(@Body() body: LoginDto, @Req() req: any) {
        return this.authService.login(body.email, body.password, {
            userAgent: req.headers?.['user-agent'],
            ip: req.ip,
        });
    }

    @Post('logout')
    logout(@CurrentUser() user: AuthenticatedUser) {
        return this.authService.logout(user.jti, { id: user.id, name: user.name });
    }

    @Get('me')
    me(@CurrentUser() user: AuthenticatedUser) {
        return this.authService.perfil(user.id);
    }

    /** Minha conta: o nome e as preferências da própria pessoa. Qualquer conta. */
    @Patch('me')
    atualizarPerfil(@CurrentUser() user: AuthenticatedUser, @Body() body: AtualizarPerfilDto) {
        return this.authService.atualizarPerfil(user.id, body);
    }

    // Mesma lógica do login: exige a senha atual, então também vale proteger
    // contra tentativa repetida de adivinhar essa senha.
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @Post('password')
    trocarSenha(@CurrentUser() user: AuthenticatedUser, @Body() body: ChangePasswordDto) {
        return this.authService.trocarSenha(user.id, body.currentPassword, body.newPassword);
    }
}
