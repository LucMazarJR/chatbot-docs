import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { UserSession } from '../../users/entities/user-session.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Autentica pelo Bearer token e confirma que a sessão continua valendo.
 *
 * Escrito à mão em vez de passport-jwt: são poucas linhas, sem a indireção de
 * registrar estratégia, e duas dependências a menos.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly jwtService: JwtService,
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        @InjectRepository(UserSession) private readonly sessionsRepo: Repository<UserSession>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const publico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (publico) return true;

        const request = context.switchToHttp().getRequest();
        const cabecalho: string | undefined = request.headers?.authorization;

        if (!cabecalho?.startsWith('Bearer ')) {
            throw new UnauthorizedException('Autenticação necessária');
        }

        let payload: any;
        try {
            payload = await this.jwtService.verifyAsync(cabecalho.slice(7));
        } catch {
            throw new UnauthorizedException('Sessão expirada ou inválida');
        }

        // A sessão precisa existir e não ter sido revogada. É isto que faz
        // "desativar usuário" ter efeito imediato em vez de esperar o token
        // expirar — até 8 horas depois.
        const sessao = await this.sessionsRepo.findOne({
            // `expiresAt` é redundante com a verificação do JWT, e é de
            // propósito: se um dia o segredo vazar e alguém forjar um token com
            // validade longa, a linha da sessão continua sendo o limite real.
            where: { jti: payload.jti, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
        });
        if (!sessao) {
            throw new UnauthorizedException('Sessão encerrada');
        }

        const usuario = await this.usersRepo.findOne({ where: { id: payload.sub } });
        if (!usuario || !usuario.isActive) {
            throw new UnauthorizedException('Usuário desativado');
        }

        // O papel vem do banco, não do token: promover ou rebaixar alguém passa
        // a valer na requisição seguinte, sem precisar deslogar.
        const autenticado: AuthenticatedUser = {
            id: usuario.id,
            name: usuario.name,
            email: usuario.email,
            role: usuario.role,
            jti: payload.jti,
        };
        request.user = autenticado;
        return true;
    }
}
