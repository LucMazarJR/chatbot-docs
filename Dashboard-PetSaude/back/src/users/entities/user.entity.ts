import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'admin' | 'editor' | 'leitor';

export const USER_ROLES: UserRole[] = ['admin', 'editor', 'leitor'];

/**
 * Usuário do dashboard.
 *
 * Mora no Postgres, não no Mongo: as FAQs são um contrato compartilhado com a
 * ingestão Python e com o fluxo do n8n, e identidade não tem nada a ver com
 * conteúdo de FAQ.
 *
 * Colunas em snake_case (convenção do SQL) com propriedades em camelCase,
 * mapeadas explicitamente — sem depender de naming strategy externa.
 */
@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'name', type: 'varchar', length: 120 })
    name: string;

    // Guardado sempre em minúsculas pelo service: evita depender da extensão
    // citext só para comparar e-mail sem diferenciar caixa.
    @Index({ unique: true })
    @Column({ name: 'email', type: 'varchar', length: 160 })
    email: string;

    // `select: false`: o hash não é carregado a menos que alguém peça
    // explicitamente com addSelect. É a primeira das duas barreiras — a outra
    // é o mapeamento para PublicUser no service.
    @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false })
    passwordHash: string;

    @Column({ name: 'role', type: 'varchar', length: 20, default: 'leitor' })
    role: UserRole;

    // Desativar é sempre isto, nunca DELETE: o log de atividades referencia o
    // usuário, e apagar a linha deixaria o histórico órfão.
    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({ name: 'must_change_password', type: 'boolean', default: false })
    mustChangePassword: boolean;

    @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
    lastLoginAt: Date | null;

    @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
    createdById: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}

/** O que pode sair para o cliente. Nunca inclui passwordHash. */
export type PublicUser = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
};

export function toPublicUser(user: User): PublicUser {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt ?? null,
        createdAt: user.createdAt,
    };
}
