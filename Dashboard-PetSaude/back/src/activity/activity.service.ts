import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
    Activity,
    ActivityDocument,
    RETENCAO_DIAS,
    type TipoEntidade,
} from './schemas/activity.schema';

/** Um registro a gravar. Só `actor_name`, `action` e `entity_type` são exigidos. */
export type RegistroAuditoria = {
    actor_name: string;
    actor_id?: string;
    action: string;
    entity_type: TipoEntidade;
    entity_id?: string;
    /** Descrição curta do alvo: a pergunta da FAQ, o nome do usuário. */
    target?: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    batch_id?: string;
    status?: 'sucesso' | 'negado';
    ip?: string;
    user_agent?: string;
};

export type FiltroAuditoria = {
    page?: number;
    limit?: number;
    actorId?: string;
    entityType?: TipoEntidade;
    entityId?: string;
    action?: string;
    status?: 'sucesso' | 'negado';
    /** Instante ISO completo, montado no fuso de quem filtrou. Inclusivo. */
    de?: string;
    ate?: string;
};

@Injectable()
export class ActivityService {
    private readonly logger = new Logger(ActivityService.name);

    constructor(@InjectModel(Activity.name) private activityModel: Model<ActivityDocument>) { }

    /**
     * Grava um registro de auditoria.
     *
     * LÓGICA DO LUCIANO: nunca lança. Auditoria que derruba a operação auditada
     * é pior que auditoria nenhuma — uma falha do Mongo ao gravar o log
     * impediria alguém de criar uma FAQ ou de fazer login. O erro vai para o
     * log do processo e a operação segue.
     *
     * Antes daqui saía um deleteMany das edições anteriores da mesma FAQ, então
     * o histórico guardava só a última: um log de auditoria que apagava a
     * própria auditoria. A coleção cresce, que é o comportamento correto, e
     * quem controla o tamanho é o prazo de retenção, não o esquecimento.
     */
    async registrar(registro: RegistroAuditoria): Promise<void> {
        try {
            const dias = RETENCAO_DIAS[registro.entity_type] ?? 365;
            const expiraEm = new Date();
            expiraEm.setDate(expiraEm.getDate() + dias);

            await new this.activityModel({
                ...registro,
                target: registro.target ?? '',
                status: registro.status ?? 'sucesso',
                created_at: new Date(),
                expires_at: expiraEm,
            }).save();
        } catch (erro) {
            this.logger.error(
                `Nao foi possivel gravar a auditoria: ${erro instanceof Error ? erro.message : erro}`,
            );
        }
    }

    /**
     * Atalho antigo, mantido para os pontos que só registram FAQ.
     *
     * Continua existindo para o diff das chamadas ficar pequeno, mas todo lugar
     * que tem mais contexto deve usar `registrar` — é lá que entram entity_id,
     * antes/depois e o id do lote.
     */
    async logActivity(
        actor_name: string,
        action: string,
        question: string | null,
        actor_id?: string,
    ): Promise<void> {
        await this.registrar({
            actor_name,
            actor_id,
            action,
            entity_type: 'faq',
            target: question,
        });
    }

    private montarFiltro(f: FiltroAuditoria): Record<string, unknown> {
        const filtro: Record<string, unknown> = {};

        if (f.actorId) filtro.actor_id = f.actorId;
        if (f.entityType) filtro.entity_type = f.entityType;
        if (f.entityId) filtro.entity_id = f.entityId;
        if (f.action) filtro.action = f.action;
        if (f.status) filtro.status = f.status;

        // LÓGICA DO LUCIANO: as pontas chegam como instante completo, montado
        // no fuso de quem filtrou. Aqui havia `new Date('2026-03-10')`, que o
        // JavaScript lê como meia-noite UTC, seguido de `setHours` LOCAL: num
        // servidor em UTC-3 o intervalo virava 9/03 21:00 até 9/03 23:59, e
        // filtrar "de 10/03 até 10/03" não devolvia nada do dia 10. O teste
        // passava porque só conferia se a hora era 23.
        if (f.de || f.ate) {
            const intervalo: Record<string, Date> = {};
            if (f.de) intervalo.$gte = new Date(f.de);
            if (f.ate) intervalo.$lte = new Date(f.ate);
            filtro.created_at = intervalo;
        }

        return filtro;
    }

    async getRecentActivities(params: FiltroAuditoria = {}) {
        const page = Math.max(1, params.page ?? 1);
        const limit = Math.min(100, Math.max(1, params.limit ?? 15));
        const filtro = this.montarFiltro(params);

        const [docs, total] = await Promise.all([
            this.activityModel
                .find(filtro)
                // _id como desempate: uma importação grava dezenas de registros
                // no mesmo instante, e sem ele a ordem varia entre páginas.
                .sort({ created_at: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
                .exec(),
            this.activityModel.countDocuments(filtro).exec(),
        ]);

        return {
            items: docs.map((doc: any) => ({
                id: doc._id.toString(),
                actor_name: doc.actor_name,
                actor_id: doc.actor_id ?? null,
                action: doc.action,
                // O front chama de `question` desde sempre; manter o nome evita
                // um rename que não muda nada para quem lê a tela.
                question: doc.target || '',
                entity_type: doc.entity_type ?? 'faq',
                entity_id: doc.entity_id ?? null,
                before: doc.before ?? null,
                after: doc.after ?? null,
                batch_id: doc.batch_id ?? null,
                status: doc.status ?? 'sucesso',
                created_at: doc.created_at,
            })),
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }

    /** Quem aparece no histórico, para alimentar o filtro por pessoa. */
    async atores(): Promise<{ id: string | null; nome: string }[]> {
        // Agrupa por actor_id, nao pelo par (id, nome): a mesma pessoa aparece
        // com o nome no login e com o e-mail digitado no login recusado, e o
        // par produzia duas entradas para o mesmo id -- chave repetida no React
        // e dois itens identicos no filtro.
        //
        // E filtra quem nao tem id antes de cortar em 200. Sem isso, uma
        // varredura de credenciais cria um grupo por e-mail tentado e empurra
        // os usuarios de verdade para fora da lista.
        const grupos = await this.activityModel
            .aggregate([
                { $match: { actor_id: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id: '$actor_id',
                        nome: { $last: '$actor_name' },
                        visto: { $max: '$created_at' },
                    },
                },
                { $sort: { visto: -1 } },
                { $limit: 200 },
            ])
            .exec();

        return grupos
            .map((g) => ({ id: g._id as string, nome: g.nome as string }))
            .filter((a) => a.nome)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
}
