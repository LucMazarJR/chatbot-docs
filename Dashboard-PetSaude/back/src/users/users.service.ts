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
import { ActivityService } from '../activity/activity.service';
import { PublicUser, toPublicUser, User, UserRole } from './entities/user.entity';

/** Quem executou a acao. O nome vai junto porque o historico precisa ser
 *  legivel sem consultar a tabela de usuarios. */
export type Ator = { id: string; name: string };

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        private readonly authService: AuthService,
        private readonly activityService: ActivityService,
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
    }, criadoPor?: Ator): Promise<PublicUser> {
        const email = dados.email.trim().toLowerCase();

        const usuario = this.usersRepo.create({
            name: dados.name.trim(),
            email,
            passwordHash: await bcrypt.hash(dados.password, 10),
            role: dados.role ?? 'leitor',
            isActive: true,
            // Senha definida por um admin é provisória por natureza.
            mustChangePassword: true,
            createdById: criadoPor?.id ?? null,
        });

        try {
            const salvo = await this.usersRepo.save(usuario);

            await this.activityService.registrar({
                actor_name: criadoPor?.name ?? 'sistema',
                actor_id: criadoPor?.id,
                action: 'criar_usuario',
                entity_type: 'usuario',
                entity_id: salvo.id,
                target: salvo.name,
                // Sem senha nem hash: o registro diz o que foi feito, nao
                // guarda credencial.
                after: { email: salvo.email, role: salvo.role },
            });

            return toPublicUser(salvo);
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
        solicitante: Ator,
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

        // O estado de antes, para o historico guardar a diferenca. So os
        // quatro campos que esta operacao consegue mudar.
        const antes = {
            name: usuario.name,
            email: usuario.email,
            role: usuario.role,
            isActive: usuario.isActive,
        };

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

            const depois = {
                name: salvo.name,
                email: salvo.email,
                role: salvo.role,
                isActive: salvo.isActive,
            };
            const mudou = (Object.keys(antes) as (keyof typeof antes)[]).filter(
                (c) => antes[c] !== depois[c],
            );

            // Sem alteracao real, sem registro: salvar o mesmo valor de novo nao
            // e um evento, e enche o historico de ruido.
            if (mudou.length > 0) {
                await this.activityService.registrar({
                    actor_name: solicitante.name,
                    actor_id: solicitante.id,
                    action: dados.isActive === false ? 'desativar_usuario' : 'editar_usuario',
                    entity_type: 'usuario',
                    entity_id: salvo.id,
                    target: salvo.name,
                    before: Object.fromEntries(mudou.map((c) => [c, antes[c]])),
                    after: Object.fromEntries(mudou.map((c) => [c, depois[c]])),
                });
            }

            return toPublicUser(salvo);
        } catch (erro: any) {
            if (erro?.code === '23505') {
                throw new ConflictException('Já existe um usuário com este e-mail');
            }
            throw erro;
        }
    }

    async desativar(id: string, solicitante: Ator): Promise<PublicUser> {
        return this.atualizar(id, { isActive: false }, solicitante);
    }

    async definirSenha(id: string, novaSenha: string, solicitante: Ator): Promise<{ ok: true }> {
        const usuario = await this.usersRepo.findOne({ where: { id } });
        if (!usuario) throw new NotFoundException('Usuário não encontrado');

        usuario.passwordHash = await bcrypt.hash(novaSenha, 10);
        usuario.mustChangePassword = true;
        await this.usersRepo.save(usuario);
        await this.authService.revogarSessoes(id);

        // Um administrador redefinindo a senha de outra pessoa e a operacao mais
        // sensivel desta tela: da acesso a conta alheia e derruba as sessoes
        // dela. Ate aqui nao sobrava registro nenhum.
        await this.activityService.registrar({
            actor_name: solicitante.name,
            actor_id: solicitante.id,
            action: 'redefinir_senha',
            entity_type: 'usuario',
            entity_id: usuario.id,
            target: usuario.name,
        });

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
