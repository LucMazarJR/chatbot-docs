import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { User } from '../users/entities/user.entity';
import { AREAS, normalizarPermissoes, type Permissoes } from './areas';
import { Grupo } from './entities/grupo.entity';

type Ator = { id: string; name: string };

export type GrupoComMembros = {
    id: string;
    nome: string;
    descricao: string;
    permissoes: Permissoes;
    /** Contas ativas no grupo. */
    membros: number;
    /** Desativadas continuam presas ao grupo: contam para apagar, não para a tela. */
    desativadas: number;
};

@Injectable()
export class GruposService {
    constructor(
        @InjectRepository(Grupo) private readonly gruposRepo: Repository<Grupo>,
        @InjectRepository(User) private readonly usersRepo: Repository<User>,
        private readonly activityService: ActivityService,
    ) { }

    async listar(): Promise<GrupoComMembros[]> {
        const [grupos, contagens] = await Promise.all([
            this.gruposRepo.find({ order: { nome: 'ASC' } }),
            this.usersRepo
                .createQueryBuilder('u')
                .select('u.grupo_id', 'grupoId')
                .addSelect('COUNT(*) FILTER (WHERE u.is_active)', 'ativas')
                .addSelect('COUNT(*) FILTER (WHERE NOT u.is_active)', 'desativadas')
                .groupBy('u.grupo_id')
                .getRawMany<{ grupoId: string; ativas: string; desativadas: string }>(),
        ]);

        // O COUNT do Postgres chega como texto (bigint), daí o Number.
        const porGrupo = new Map(contagens.map((c) => [c.grupoId, c]));
        return grupos.map((g) => ({
            id: g.id,
            nome: g.nome,
            descricao: g.descricao,
            permissoes: g.permissoes,
            membros: Number(porGrupo.get(g.id)?.ativas ?? 0),
            desativadas: Number(porGrupo.get(g.id)?.desativadas ?? 0),
        }));
    }

    async criar(
        dados: { nome: string; descricao?: string; permissoes: unknown },
        ator: Ator,
    ): Promise<Grupo> {
        const permissoes = this.permissoesValidas(dados.permissoes);
        const grupo = this.gruposRepo.create({
            nome: dados.nome.trim(),
            descricao: dados.descricao?.trim() ?? '',
            permissoes,
        });

        const salvo = await this.salvar(grupo);
        await this.activityService.registrar({
            actor_name: ator.name,
            actor_id: ator.id,
            action: 'criar_grupo',
            entity_type: 'grupo',
            entity_id: salvo.id,
            target: salvo.nome,
            after: { ...porArea({}, permissoes, true).depois },
        });
        return salvo;
    }

    /**
     * Muda o grupo, e com ele o acesso de todos os membros: o guard relê o grupo
     * a cada requisição, então vale na seguinte de cada um.
     */
    async atualizar(
        id: string,
        dados: { nome?: string; descricao?: string; permissoes?: unknown },
        ator: Ator,
    ): Promise<Grupo> {
        const grupo = await this.gruposRepo.findOne({ where: { id } });
        if (!grupo) throw new NotFoundException('Este grupo não existe mais. Recarregue a página.');

        const antes = { nome: grupo.nome, descricao: grupo.descricao, permissoes: grupo.permissoes };

        if (dados.nome !== undefined) grupo.nome = dados.nome.trim();
        if (dados.descricao !== undefined) grupo.descricao = dados.descricao.trim();
        if (dados.permissoes !== undefined) grupo.permissoes = this.permissoesValidas(dados.permissoes);

        const salvo = await this.salvar(grupo);

        // O antes e o depois área por área: "Conversas: sem acesso → ver" diz
        // o que mudou para os membros, um JSON inteiro não diria.
        const areas = porArea(antes.permissoes, salvo.permissoes, false);
        const before: Record<string, string> = { ...areas.antes };
        const after: Record<string, string> = { ...areas.depois };
        if (antes.nome !== salvo.nome) {
            before.name = antes.nome;
            after.name = salvo.nome;
        }
        if (antes.descricao !== salvo.descricao) {
            before.descricao = antes.descricao;
            after.descricao = salvo.descricao;
        }

        if (Object.keys(after).length > 0) {
            await this.activityService.registrar({
                actor_name: ator.name,
                actor_id: ator.id,
                action: 'editar_grupo',
                entity_type: 'grupo',
                entity_id: salvo.id,
                target: salvo.nome,
                before,
                after,
            });
        }
        return salvo;
    }

    async apagar(id: string, ator: Ator): Promise<{ ok: true }> {
        const grupo = await this.gruposRepo.findOne({ where: { id } });
        if (!grupo) throw new NotFoundException('Este grupo não existe mais. Recarregue a página.');

        const ativas = await this.usersRepo.count({ where: { grupoId: id, isActive: true } });
        const todas = await this.usersRepo.count({ where: { grupoId: id } });
        if (todas > 0) {
            // Conta desativada também prende o grupo (a chave estrangeira), e
            // sem dizer isso a pessoa veria "0 pessoas" e não entenderia a recusa.
            const desativadas = todas - ativas;
            const partes = [
                ativas > 0 ? `${ativas} ${ativas === 1 ? 'conta ativa' : 'contas ativas'}` : '',
                desativadas > 0
                    ? `${desativadas} ${desativadas === 1 ? 'conta desativada' : 'contas desativadas'}`
                    : '',
            ].filter(Boolean);
            throw new ConflictException(
                `${grupo.nome} ainda tem ${partes.join(' e ')}. Mova essas contas para outro grupo, na tela de Usuários, e apague depois.`,
            );
        }

        const total = await this.gruposRepo.count();
        if (total <= 1) {
            throw new ConflictException(
                'Este é o único grupo. Crie outro antes, para as contas novas terem onde entrar.',
            );
        }

        await this.gruposRepo.delete(id);
        await this.activityService.registrar({
            actor_name: ator.name,
            actor_id: ator.id,
            action: 'apagar_grupo',
            entity_type: 'grupo',
            entity_id: id,
            target: grupo.nome,
        });
        return { ok: true };
    }

    private permissoesValidas(entrada: unknown): Permissoes {
        const { permissoes, erros } = normalizarPermissoes(entrada);
        if (erros.length > 0) throw new BadRequestException(erros.join(' '));
        return permissoes;
    }

    private async salvar(grupo: Grupo): Promise<Grupo> {
        try {
            return await this.gruposRepo.save(grupo);
        } catch (erro: any) {
            // 23505 = unique_violation: o índice é sobre lower(nome).
            if (erro?.code === '23505') {
                throw new ConflictException(`Já existe um grupo chamado ${grupo.nome}. Escolha outro nome.`);
            }
            throw erro;
        }
    }
}

/**
 * As áreas que mudaram, no formato do Histórico. Com `todas`, lista também as
 * que ficaram iguais: é o caso do grupo novo, em que tudo é novidade.
 */
function porArea(
    antes: Permissoes,
    depois: Permissoes,
    todas: boolean,
): { antes: Record<string, string>; depois: Record<string, string> } {
    const resultado = { antes: {} as Record<string, string>, depois: {} as Record<string, string> };
    for (const area of AREAS) {
        const a = antes[area] ?? 'sem acesso';
        const d = depois[area] ?? 'sem acesso';
        if (a === d && !(todas && d !== 'sem acesso')) continue;
        resultado.antes[area] = a;
        resultado.depois[area] = d;
    }
    return resultado;
}
