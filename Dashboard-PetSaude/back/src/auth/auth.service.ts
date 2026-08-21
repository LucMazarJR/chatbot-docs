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
            throw new UnauthorizedException('E-mail ou senha inválidos');
        }

        // Só depois da senha conferir: assim o aviso não revela nada a quem
        // não sabia a senha.
        if (!usuario.isActive) {
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

        return { accessToken, expiresAt, user: toPublicUser(usuario) };
    }

    async logout(jti: string): Promise<{ ok: true }> {
        await this.sessionsRepo.update({ jti, revokedAt: IsNull() }, { revokedAt: new Date() });
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
            throw new UnauthorizedException('Senha atual incorreta');
        }

        usuario.passwordHash = await bcrypt.hash(senhaNova, 10);
        usuario.mustChangePassword = false;
        await this.usersRepo.save(usuario);

        // Trocar a senha derruba as outras sessões: se alguém entrou com a
        // senha antiga, perde o acesso agora.
        await this.revogarSessoes(userId);
        return { ok: true };
    }

    async perfil(userId: string): Promise<PublicUser> {
        const usuario = await this.usersRepo.findOne({ where: { id: userId } });
        if (!usuario) throw new UnauthorizedException('Usuário não encontrado');
        return toPublicUser(usuario);
    }
}
