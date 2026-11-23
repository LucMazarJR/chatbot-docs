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
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { cabeEm } from '../grupos/areas';
import { Grupo } from '../grupos/entities/grupo.entity';
import { PublicUser, toPublicUser, User } from './entities/user.entity';

/** Quem pede a mudança, com o acesso que tem: as travas comparam com ele. */
export type Solicitante = Pick<AuthenticatedUser, 'id' | 'name' | 'master' | 'permissoes'>;

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        @InjectRepository(Grupo) private readonly gruposRepo: Repository<Grupo>,
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
        grupoId: string;
    }, solicitante: Solicitante): Promise<PublicUser> {
        const email = dados.email.trim().toLowerCase();
        const grupo = await this.grupoParaAtribuir(dados.grupoId, solicitante);

        const usuario = this.usersRepo.create({
            name: dados.name.trim(),
            email,
            passwordHash: await bcrypt.hash(dados.password, 10),
            grupoId: grupo.id,
            grupo,
            master: false,
            isActive: true,
            // Senha definida por outra pessoa é provisória por natureza.
            mustChangePassword: true,
            createdById: solicitante.id,
        });

        try {
            const salvo = await this.usersRepo.save(usuario);

            await this.activityService.registrar({
                actor_name: solicitante.name,
                actor_id: solicitante.id,
                action: 'criar_usuario',
                entity_type: 'usuario',
                entity_id: salvo.id,
                target: salvo.name,
                // Sem senha nem hash: o registro diz o que foi feito, nao
                // guarda credencial.
                after: { email: salvo.email, grupo: grupo.nome },
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
        dados: { name?: string; email?: string; grupoId?: string; isActive?: boolean; master?: boolean },
        solicitante: Solicitante,
    ): Promise<PublicUser> {
        const usuario = await this.usersRepo.findOne({ where: { id } });
        if (!usuario) throw new NotFoundException('Usuário não encontrado');

        const ehVoce = usuario.id === solicitante.id;
        this.exigirQueGerencie(usuario, solicitante);

        if (dados.master !== undefined && dados.master !== usuario.master && !solicitante.master) {
            throw new ForbiddenException('Só o master passa o master para outra pessoa.');
        }

        // Mudar o próprio grupo seria o caminho mais curto para se promover, e
        // rebaixar a si mesmo tira o acesso a esta tela sem ninguém por perto
        // para desfazer. O master pode: o acesso dele não vem do grupo.
        const trocaGrupo = dados.grupoId !== undefined && dados.grupoId !== usuario.grupoId;
        if (ehVoce && trocaGrupo && !solicitante.master) {
            throw new ForbiddenException(
                'Você não pode mudar o seu próprio grupo. Peça a outra pessoa que cuida das contas.',
            );
        }
        if (ehVoce && dados.isActive === false) {
            throw new ForbiddenException('Você não pode desativar a própria conta.');
        }

        const perdeMaster =
            usuario.master && (dados.master === false || dados.isActive === false);
        if (perdeMaster) await this.garantirQueSobraMaster(usuario.id);

        const novoGrupo = trocaGrupo
            ? await this.grupoParaAtribuir(dados.grupoId as string, solicitante)
            : null;

        // O estado de antes, para o historico guardar a diferenca. So os
        // campos que esta operacao consegue mudar.
        const antes = {
            name: usuario.name,
            email: usuario.email,
            grupo: usuario.grupo?.nome ?? '',
            master: usuario.master,
            isActive: usuario.isActive,
        };

        if (dados.name !== undefined) usuario.name = dados.name.trim();
        if (dados.email !== undefined) usuario.email = dados.email.trim().toLowerCase();
        if (novoGrupo) {
            usuario.grupoId = novoGrupo.id;
            usuario.grupo = novoGrupo;
        }
        if (dados.master !== undefined) usuario.master = dados.master;
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
                grupo: salvo.grupo?.nome ?? '',
                master: salvo.master,
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

    async desativar(id: string, solicitante: Solicitante): Promise<PublicUser> {
        return this.atualizar(id, { isActive: false }, solicitante);
    }

    async definirSenha(id: string, novaSenha: string, solicitante: Solicitante): Promise<{ ok: true }> {
        const usuario = await this.usersRepo.findOne({ where: { id } });
        if (!usuario) throw new NotFoundException('Usuário não encontrado');
        // Redefinir a senha de alguém é entrar na conta dele: com mais acesso
        // que o seu, seria se promover por outro caminho.
        this.exigirQueGerencie(usuario, solicitante);

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

    /**
     * Quem cuida das contas sem ser master só mexe em conta com acesso igual ou
     * menor que o dele. Sem isto, alguém com a área Usuários e pouco mais
     * redefiniria a senha de um administrador e entraria como ele.
     */
    private exigirQueGerencie(alvo: User, solicitante: Solicitante): void {
        if (solicitante.master || alvo.id === solicitante.id) return;
        if (alvo.master) {
            throw new ForbiddenException('Só o master muda a conta do master.');
        }
        if (!cabeEm(alvo.grupo?.permissoes ?? {}, solicitante.permissoes)) {
            throw new ForbiddenException(
                `${alvo.name} está num grupo com mais acesso que o seu. Peça ao master do painel.`,
            );
        }
    }

    /** O grupo existe e cabe no acesso de quem está atribuindo. */
    private async grupoParaAtribuir(grupoId: string, solicitante: Solicitante): Promise<Grupo> {
        const grupo = await this.gruposRepo.findOne({ where: { id: grupoId } });
        if (!grupo) {
            throw new NotFoundException(
                'Este grupo não existe mais. Recarregue a página e escolha outro.',
            );
        }
        if (!solicitante.master && !cabeEm(grupo.permissoes, solicitante.permissoes)) {
            throw new ForbiddenException(
                `O grupo ${grupo.nome} dá mais acesso que o seu. Escolha outro, ou peça ao master do painel.`,
            );
        }
        return grupo;
    }

    /** Impede que a instalação fique sem master ativo: só o banco resolveria. */
    private async garantirQueSobraMaster(idExcluido: string): Promise<void> {
        const outros = await this.usersRepo.count({
            where: { master: true, isActive: true, id: Not(idExcluido) },
        });
        if (outros === 0) {
            throw new ForbiddenException(
                'Esta é a única conta master ativa. Passe o master para outra pessoa antes.',
            );
        }
    }
}
