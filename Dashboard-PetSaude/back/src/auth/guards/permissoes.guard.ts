import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { permite, type Area, type Nivel } from '../../grupos/areas';
import { PERMITE_KEY, SO_MASTER_KEY, type Exigencia } from '../decorators/permite.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Autorização pelas permissões do grupo. Precisa rodar DEPOIS do JwtAuthGuard:
 * ele lê `request.user`, que só existe depois da autenticação. A ordem é
 * garantida pela ordem de declaração dos APP_GUARD no módulo.
 */
@Injectable()
export class PermissoesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const alvos = [context.getHandler(), context.getClass()];
        const soMaster = this.reflector.getAllAndOverride<boolean>(SO_MASTER_KEY, alvos);
        const exigencias = this.reflector.getAllAndOverride<Exigencia[]>(PERMITE_KEY, alvos);

        // Rota sem @Permite nem @SoMaster: basta estar autenticado.
        if (!soMaster && (!exigencias || exigencias.length === 0)) return true;

        const usuario: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
        if (!usuario) throw new ForbiddenException('Você não tem permissão para esta ação');
        if (usuario.master) return true;

        if (soMaster) {
            throw new ForbiddenException('Só o master do painel cria e muda os grupos.');
        }

        const liberado = exigencias.some((exigencia) => {
            const [area, nivel] = exigencia.split(':') as [Area, Nivel];
            return permite(usuario.permissoes, area, nivel);
        });
        if (!liberado) {
            throw new ForbiddenException(
                'O seu grupo não dá acesso a esta ação. Peça ao master do painel para incluí-la.',
            );
        }
        return true;
    }
}
