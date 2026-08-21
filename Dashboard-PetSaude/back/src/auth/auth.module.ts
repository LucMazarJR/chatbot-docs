import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { UserSession } from '../users/entities/user-session.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([User, UserSession]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_SECRET') ?? 'troque-este-segredo-no-env',
                // Em segundos, não em "8h": a tipagem do expiresIn textual exige
                // um literal específico, e o número ainda casa direto com o
                // maxAge do cookie de sessão no front.
                signOptions: {
                    expiresIn: Number(config.get<string>('JWT_EXPIRES_IN_SECONDS')) || 8 * 60 * 60,
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        // A ORDEM IMPORTA: o RolesGuard lê request.user, que só existe depois
        // que o JwtAuthGuard rodou. Inverter faz toda checagem de papel
        // acontecer contra undefined.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
    exports: [AuthService],
})
export class AuthModule { }
