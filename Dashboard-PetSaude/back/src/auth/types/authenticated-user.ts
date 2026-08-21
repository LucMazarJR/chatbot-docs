import type { UserRole } from '../../users/entities/user.entity';

/** O que o guard anexa em `request.user` depois de validar o token. */
export type AuthenticatedUser = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    jti: string;
};
