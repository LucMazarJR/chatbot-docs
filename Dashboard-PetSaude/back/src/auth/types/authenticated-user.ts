import type { Permissoes } from '../../grupos/areas';

/** O que o guard anexa em `request.user` depois de validar o token. */
export type AuthenticatedUser = {
    id: string;
    name: string;
    email: string;
    master: boolean;
    grupoId: string;
    permissoes: Permissoes;
    jti: string;
};
