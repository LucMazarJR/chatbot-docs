import { Body, Controller, Get, Post, Req } from '@nestjs/common';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

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
        return this.authService.logout(user.jti);
    }

    @Get('me')
    me(@CurrentUser() user: AuthenticatedUser) {
        return this.authService.perfil(user.id);
    }

    @Post('password')
    trocarSenha(@CurrentUser() user: AuthenticatedUser, @Body() body: ChangePasswordDto) {
        return this.authService.trocarSenha(user.id, body.currentPassword, body.newPassword);
    }
}
