import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { AuthService } from '../auth/auth.service';
import { PublicUser, toPublicUser, User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        private readonly authService: AuthService,
    ) { }

    async listar(apenasAtivos = false): Promise<PublicUser[]> {
        const usuarios = await this.usersRepo.find({
            where: apenasAtivos ? { isActive: true } : {},
            order: { name: 'ASC' },
        });
        return usuarios.map(toPublicUser);
    }

    async criar(dados: {
        name: string;
        email: string;
        password: string;
        role?: UserRole;
    }, criadoPor?: string): Promise<PublicUser> {
        const email = dados.email.trim().toLowerCase();

        const usuario = this.usersRepo.create({
            name: dados.name.trim(),
            email,
            passwordHash: await bcrypt.hash(dados.password, 10),
            role: dados.role ?? 'leitor',
            isActive: true,
            // Senha definida por um admin é provisória por natureza.
            mustChangePassword: true,
            createdById: criadoPor ?? null,
        });

        try {
            return toPublicUser(await this.usersRepo.save(usuario));
        } catch (erro: any) {
            // 23505 = unique_violation no Postgres
            if (erro?.code === '23505') {
                throw new ConflictException('Já existe um usuário com este e-mail');
            }
            throw erro;
        }
    }

    async atualizar(
        id: string,
        dados: { name?: string; email?: string; role?: UserRole; isActive?: boolean },
        solicitante: { id: string },
    ): Promise<PublicUser> {
        const usuario = await this.usersRepo.findOne({ where: { id } });
        if (!usuario) throw new NotFoundException('Usuário não encontrado');

        const seRebaixando = dados.role !== undefined && dados.role !== 'admin';
        const seDesativando = dados.isActive === false;

        // Um admin não pode se rebaixar nem se desativar: um clique errado
        // deixaria o sistema sem ninguém capaz de administrar.
        if (usuario.id === solicitante.id && (seRebaixando || seDesativando)) {
            throw new ForbiddenException(
                'Você não pode rebaixar nem desativar a própria conta',
            );
        }

        if (usuario.role === 'admin' && (seRebaixando || seDesativando)) {
            await this.garantirQueSobraAdmin(usuario.id);
        }

        if (dados.name !== undefined) usuario.name = dados.name.trim();
        if (dados.email !== undefined) usuario.email = dados.email.trim().toLowerCase();
        if (dados.role !== undefined) usuario.role = dados.role;
        if (dados.isActive !== undefined) usuario.isActive = dados.isActive;

        try {
            const salvo = await this.usersRepo.save(usuario);
            // Desativar precisa valer agora, não quando o token expirar.
            if (dados.isActive === false) {
                await this.authService.revogarSessoes(salvo.id);
            }
            return toPublicUser(salvo);
        } catch (erro: any) {
            if (erro?.code === '23505') {
                throw new ConflictException('Já existe um usuário com este e-mail');
            }
            throw erro;
        }
    }

    async desativar(id: string, solicitante: { id: string }): Promise<PublicUser> {
        return this.atualizar(id, { isActive: false }, solicitante);
    }

    async definirSenha(id: string, novaSenha: string): Promise<{ ok: true }> {
        const usuario = await this.usersRepo.findOne({ where: { id } });
        if (!usuario) throw new NotFoundException('Usuário não encontrado');

        usuario.passwordHash = await bcrypt.hash(novaSenha, 10);
        usuario.mustChangePassword = true;
        await this.usersRepo.save(usuario);
        await this.authService.revogarSessoes(id);
        return { ok: true };
    }

    /** Impede que o último admin ativo perca o papel ou seja desativado. */
    private async garantirQueSobraAdmin(idExcluido: string): Promise<void> {
        const outros = await this.usersRepo.count({
            where: { role: 'admin', isActive: true, id: Not(idExcluido) },
        });
        if (outros === 0) {
            throw new ForbiddenException(
                'Este é o único administrador ativo. Promova outra pessoa antes.',
            );
        }
    }
}
