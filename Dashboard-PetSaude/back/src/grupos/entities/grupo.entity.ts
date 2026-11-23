import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import type { Permissoes } from '../areas';

/**
 * Um grupo de acesso ao painel: o que os membros podem abrir e mudar, área por
 * área do menu.
 *
 * A permissão mora no grupo, e não na pessoa, para que mudar o grupo valha para
 * todos os membros de uma vez. O guard relê o grupo a cada requisição, então a
 * mudança vale na seguinte, sem ninguém precisar sair e entrar.
 */
@Entity('grupos')
export class Grupo {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Único sem diferenciar caixa: o índice da migração é sobre lower(nome).
    @Column({ name: 'nome', type: 'varchar', length: 60 })
    nome: string;

    @Column({ name: 'descricao', type: 'varchar', length: 200, default: '' })
    descricao: string;

    @Column({ name: 'permissoes', type: 'jsonb', default: () => "'{}'::jsonb" })
    permissoes: Permissoes;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
