import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import { papelLegado, type Permissoes } from '../../grupos/areas';
import { Grupo } from '../../grupos/entities/grupo.entity';

/**
 * Usuário do dashboard.
 *
 * Mora no Postgres, não no Mongo: as FAQs são um contrato compartilhado com a
 * ingestão Python e com o fluxo do n8n, e identidade não tem nada a ver com
 * conteúdo de FAQ.
 *
 * Colunas em snake_case (convenção do SQL) com propriedades em camelCase,
 * mapeadas explicitamente, sem depender de naming strategy externa.
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
    // explicitamente com addSelect. É a primeira das duas barreiras: a outra
    // é o mapeamento para PublicUser no service.
    @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false })
    passwordHash: string;

    // A coluna `role` do banco não é mais lida: o acesso vem do grupo. Ela fica
    // até uma migração própria apagá-la (ver 1795400000000-CreateGrupos).

    @Column({ name: 'grupo_id', type: 'uuid' })
    grupoId: string;

    // `eager`: toda leitura de usuário precisa das permissões, a começar pelo
    // guard, que relê a conta a cada requisição. Query builder não respeita
    // eager: quem usa precisa do leftJoinAndSelect.
    @ManyToOne(() => Grupo, { eager: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'grupo_id' })
    grupo: Grupo;

    /** Cria e edita os grupos, e passa o master adiante. Vale por cima do grupo. */
    @Column({ name: 'master', type: 'boolean', default: false })
    master: boolean;

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
    grupo: { id: string; nome: string };
    permissoes: Permissoes;
    master: boolean;
    /** Só para o front anterior aos grupos: ver `papelLegado`. */
    role: 'admin' | 'editor' | 'leitor';
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
};

export function toPublicUser(user: User): PublicUser {
    const permissoes = user.grupo?.permissoes ?? {};
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        grupo: { id: user.grupoId, nome: user.grupo?.nome ?? '' },
        permissoes,
        master: user.master,
        role: papelLegado(user.master, permissoes),
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt ?? null,
        createdAt: user.createdAt,
    };
}
