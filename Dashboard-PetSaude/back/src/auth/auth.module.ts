import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { UserSession } from '../users/entities/user-session.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/** Tamanho mínimo do segredo. 32 hex = os 16 bytes que o .env.example manda gerar. */
const TAMANHO_MINIMO_SEGREDO = 32;

/**
 * Devolve o JWT_SECRET, ou derruba a subida.
 *
 * LÓGICA DO LUCIANO: aqui havia `?? 'troque-este-segredo-no-env'`. O `??` só
 * cobre undefined e null, então bastava a variável não chegar ao ambiente para a
 * API subir NORMALMENTE assinando tokens com uma string que está publicada no
 * GitHub. Quem lesse o repositório forjava um token de admin e passava pelo
 * guard — sem erro em log nenhum, porque do ponto de vista do processo estava
 * tudo funcionando.
 *
 * Um segredo ausente não tem padrão razoável: qualquer valor embutido no código
 * é público por definição. Então falha no boot, como o env.schema.ts do gateway
 * já faz — é preferível quebrar no deploy a descobrir depois que a autenticação
 * inteira era decorativa.
 */
// Exportada para ter teste proprio: compilar o modulo inteiro num teste
// exigiria um DataSource de verdade, e o que precisa ficar travado aqui e a
// regra, nao a fiacao do Nest.
export function exigirSegredoJwt(config: ConfigService): string {
    const segredo = config.get<string>('JWT_SECRET')?.trim();

    if (!segredo) {
        throw new Error(
            'JWT_SECRET nao esta definido. Gere um segredo e configure no ambiente — ' +
            'sem ele nao ha como assinar os tokens de sessao com seguranca.',
        );
    }

    if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
        throw new Error(
            `JWT_SECRET tem ${segredo.length} caracteres; o minimo e ${TAMANHO_MINIMO_SEGREDO}. ` +
            'Um segredo curto e adivinhavel por forca bruta.',
        );
    }

    return segredo;
}

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([User, UserSession]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: exigirSegredoJwt(config),
                // Em segundos, não em "8h": a tipagem do expiresIn textual exige
                // um literal específico, e o número ainda casa direto com o
                // maxAge do cookie de sessão no front.
                signOptions: {
                    expiresIn: Number(config.get<string>('JWT_EXPIRES_IN_SECONDS')) || 8 * 60 * 60,
                },
            }),
        }),
        // LÓGICA DO LUCIANO: limite GLOBAL generoso — paginação e busca com
        // debounce da tela de FAQs fazem várias chamadas por minuto em uso
        // normal, e um teto apertado aqui bloquearia gente trabalhando, não
        // um ataque. A proteção de verdade contra força bruta é o @Throttle
        // específico no /auth/login (ver auth.controller.ts).
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        // A ORDEM IMPORTA: o RolesGuard lê request.user, que só existe depois
        // que o JwtAuthGuard rodou. Inverter faz toda checagem de papel
        // acontecer contra undefined. O ThrottlerGuard roda antes dos dois —
        // ele nem olha para request.user — mas por ordem de registro dos
        // APP_GUARD ele entra depois; NestJS aplica todos, a ordem entre um
        // rate-limit e uma checagem de token não importa aqui.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
    exports: [AuthService],
})
export class AuthModule { }
