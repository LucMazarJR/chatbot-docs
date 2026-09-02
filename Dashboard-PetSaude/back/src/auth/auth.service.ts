import {
    ForbiddenException,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

import { PublicUser, toPublicUser, User } from '../users/entities/user.entity';
import { UserSession } from '../users/entities/user-session.entity';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    /**
     * Hash de uma senha que ninguém tem, usado só para gastar o mesmo tempo de
     * bcrypt quando o e-mail não existe. Custo 10, igual ao das senhas reais.
     */
    private static readonly HASH_DESCARTAVEL =
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

    constructor(
        private readonly jwtService: JwtService,
        private readonly activityService: ActivityService,
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        @InjectRepository(UserSession) private readonly sessionsRepo: Repository<UserSession>,
    ) { }

    async login(
        email: string,
        senha: string,
        contexto: { userAgent?: string; ip?: string } = {},
    ): Promise<{ accessToken: string; expiresAt: Date; user: PublicUser }> {
        const usuario = await this.usersRepo
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.email = :email', { email: email.trim().toLowerCase() })
            .getOne();

        // Mesma resposta para e-mail inexistente e senha errada: responder
        // diferente entrega quais e-mails existem no sistema.
        //
        // A comparação roda MESMO sem usuário, contra um hash descartável. Sem
        // isso, e-mail inexistente respondia na hora e e-mail real levava os
        // ~100ms do bcrypt — diferença suficiente para descobrir quais e-mails
        // estão cadastrados sem precisar acertar nenhuma senha. A mensagem
        // igual não adianta se o relógio entrega a resposta.
        const senhaConfere = await bcrypt.compare(
            senha,
            usuario?.passwordHash ?? AuthService.HASH_DESCARTAVEL,
        );

        if (!usuario || !senhaConfere) {
            // LÓGICA DO LUCIANO: até aqui, tentativa de acesso recusada não
            // deixava rastro nenhum — nem no banco, nem no log do processo. A
            // única barreira era o limite de 10 por minuto, e ninguém tinha
            // como descobrir depois que alguém passou a madrugada tentando.
            //
            // O e-mail digitado vai no `target` de propósito: é o que permite
            // distinguir "fulano errou a senha" de "alguém está varrendo
            // e-mails". Não confirma nem nega que a conta existe, porque o
            // registro é gravado igual nos dois casos.
            await this.activityService.registrar({
                actor_name: email.trim().toLowerCase() || 'desconhecido',
                actor_id: usuario?.id,
                action: 'login_recusado',
                entity_type: 'sessao',
                entity_id: usuario?.id,
                target: email.trim().toLowerCase(),
                status: 'negado',
                ip: contexto.ip,
                user_agent: contexto.userAgent,
            });
            throw new UnauthorizedException('E-mail ou senha inválidos');
        }

        // Só depois da senha conferir: assim o aviso não revela nada a quem
        // não sabia a senha.
        if (!usuario.isActive) {
            await this.activityService.registrar({
                actor_name: usuario.name,
                actor_id: usuario.id,
                action: 'login_recusado',
                entity_type: 'sessao',
                entity_id: usuario.id,
                target: 'conta desativada',
                status: 'negado',
                ip: contexto.ip,
                user_agent: contexto.userAgent,
            });
            throw new ForbiddenException('Usuário desativado. Fale com um administrador.');
        }

        const jti = randomUUID();
        const accessToken = await this.jwtService.signAsync({
            sub: usuario.id,
            name: usuario.name,
            email: usuario.email,
            role: usuario.role,
            jti,
        });

        const decodificado: any = this.jwtService.decode(accessToken);
        const expiresAt = new Date(decodificado.exp * 1000);

        await this.sessionsRepo.save(
            this.sessionsRepo.create({
                userId: usuario.id,
                jti,
                expiresAt,
                userAgent: contexto.userAgent?.slice(0, 255) ?? null,
                ip: contexto.ip?.slice(0, 64) ?? null,
            }),
        );

        usuario.lastLoginAt = new Date();
        await this.usersRepo.save(usuario);

        await this.activityService.registrar({
            actor_name: usuario.name,
            actor_id: usuario.id,
            action: 'login',
            entity_type: 'sessao',
            entity_id: usuario.id,
            target: usuario.email,
            ip: contexto.ip,
            user_agent: contexto.userAgent,
        });

        return { accessToken, expiresAt, user: toPublicUser(usuario) };
    }

    async logout(jti: string, ator?: { id: string; name: string }): Promise<{ ok: true }> {
        await this.sessionsRepo.update({ jti, revokedAt: IsNull() }, { revokedAt: new Date() });

        if (ator) {
            await this.activityService.registrar({
                actor_name: ator.name,
                actor_id: ator.id,
                action: 'logout',
                entity_type: 'sessao',
                entity_id: ator.id,
            });
        }
        return { ok: true };
    }

    /** Encerra todas as sessões de um usuário — usado ao desativar ou trocar senha. */
    async revogarSessoes(userId: string): Promise<void> {
        await this.sessionsRepo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    }

    async trocarSenha(userId: string, senhaAtual: string, senhaNova: string): Promise<{ ok: true }> {
        const usuario = await this.usersRepo
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.id = :id', { id: userId })
            .getOne();

        if (!usuario || !(await bcrypt.compare(senhaAtual, usuario.passwordHash))) {
            await this.activityService.registrar({
                actor_name: usuario?.name ?? 'desconhecido',
                actor_id: userId,
                action: 'troca_de_senha_recusada',
                entity_type: 'sessao',
                entity_id: userId,
                target: 'senha atual incorreta',
                status: 'negado',
            });
            throw new UnauthorizedException('Senha atual incorreta');
        }

        usuario.passwordHash = await bcrypt.hash(senhaNova, 10);
        usuario.mustChangePassword = false;
        await this.usersRepo.save(usuario);

        // Trocar a senha derruba as outras sessões: se alguém entrou com a
        // senha antiga, perde o acesso agora.
        await this.revogarSessoes(userId);

        await this.activityService.registrar({
            actor_name: usuario.name,
            actor_id: userId,
            action: 'troca_de_senha',
            entity_type: 'sessao',
            entity_id: userId,
        });

        return { ok: true };
    }

    async perfil(userId: string): Promise<PublicUser> {
        const usuario = await this.usersRepo.findOne({ where: { id: userId } });
        if (!usuario) throw new UnauthorizedException('Usuário não encontrado');
        return toPublicUser(usuario);
    }
}
