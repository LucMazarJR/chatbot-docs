import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Permissoes } from '../../grupos/areas';
import { Permite, SoMaster } from '../decorators/permite.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { PermissoesGuard } from './permissoes.guard';

@Permite('conversas:ver')
class Conversas {
    listar() { }

    @Permite('conversas:editar')
    apagar() { }
}

class Categorias {
    @Permite('categorias:ver', 'faqs:editar')
    listar() { }
}

class Grupos {
    @SoMaster()
    criar() { }
}

class Livre {
    perfil() { }
}

function contexto(classe: new () => object, metodo: string, usuario?: Partial<AuthenticatedUser>) {
    return {
        getHandler: () => (classe.prototype as Record<string, unknown>)[metodo],
        getClass: () => classe,
        switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
    } as unknown as ExecutionContext;
}

function pessoa(permissoes: Permissoes, master = false): Partial<AuthenticatedUser> {
    return { id: 'u1', name: 'Alguém', master, permissoes };
}

describe('PermissoesGuard', () => {
    const guard = new PermissoesGuard(new Reflector());

    it('rota sem exigência só pede estar autenticado', () => {
        expect(guard.canActivate(contexto(Livre, 'perfil', pessoa({ faqs: 'ver' })))).toBe(true);
    });

    it('a exigência do método vale por cima da classe', () => {
        const leitor = pessoa({ faqs: 'ver', conversas: 'ver' });
        expect(guard.canActivate(contexto(Conversas, 'listar', leitor))).toBe(true);
        expect(() => guard.canActivate(contexto(Conversas, 'apagar', leitor))).toThrow(
            ForbiddenException,
        );
    });

    it('qualquer uma das exigências libera', () => {
        const editorDeFaq = pessoa({ faqs: 'editar' });
        expect(guard.canActivate(contexto(Categorias, 'listar', editorDeFaq))).toBe(true);
        expect(() => guard.canActivate(contexto(Categorias, 'listar', pessoa({ faqs: 'ver' })))).toThrow(
            ForbiddenException,
        );
    });

    it('o master passa em tudo, até no que nenhum grupo libera', () => {
        const master = pessoa({ faqs: 'ver' }, true);
        expect(guard.canActivate(contexto(Conversas, 'apagar', master))).toBe(true);
        expect(guard.canActivate(contexto(Grupos, 'criar', master))).toBe(true);
    });

    it('mexer em grupo é só do master, mesmo para quem tem tudo', () => {
        const administrador = pessoa({ faqs: 'editar', usuarios: 'editar', conversas: 'editar' });
        expect(() => guard.canActivate(contexto(Grupos, 'criar', administrador))).toThrow(
            /master/,
        );
    });

    it('sem usuário na requisição, recusa', () => {
        expect(() => guard.canActivate(contexto(Conversas, 'listar', undefined))).toThrow(
            ForbiddenException,
        );
    });
});
