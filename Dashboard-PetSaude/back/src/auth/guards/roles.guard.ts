import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { UserRole } from '../../users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Autorização por papel. Precisa rodar DEPOIS do JwtAuthGuard — ele lê
 * `request.user`, que só existe depois da autenticação. A ordem é garantida
 * pela ordem de declaração dos APP_GUARD no módulo.
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const exigidos = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // Rota sem @Roles: basta estar autenticado.
        if (!exigidos || exigidos.length === 0) return true;

        const usuario = context.switchToHttp().getRequest().user;
        if (!usuario || !exigidos.includes(usuario.role)) {
            throw new ForbiddenException('Você não tem permissão para esta ação');
        }
        return true;
    }
}
