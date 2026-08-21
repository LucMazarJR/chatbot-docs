import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Sessão emitida no login, identificada pelo `jti` do JWT.
 *
 * Por que existe: JWT é sem estado, então "desativar usuário" só teria efeito
 * quando o token expirasse — até 8 horas de escrita liberada para alguém que o
 * admin acabou de revogar. Como o ponto de desativar é ser imediato, cada
 * requisição confere se a sessão continua válida.
 *
 * O custo é uma consulta indexada no Postgres por requisição autenticada, o
 * que neste volume é irrelevante.
 */
@Entity('user_sessions')
export class UserSession {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ name: 'user_id', type: 'uuid' })
    userId: string;

    @Index({ unique: true })
    @Column({ name: 'jti', type: 'varchar', length: 64 })
    jti: string;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt: Date;

    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
    revokedAt: Date | null;

    @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
    userAgent: string | null;

    @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
    ip: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
