import { randomUUID } from 'node:crypto';

import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { CriarNotificacaoDto } from './dto/criar-notificacao.dto';
import { montarAvisos, plataformaDe, problemaNaJanela, resumirPorPlataforma, type ResumoDePlataforma } from './regras';
import { ContaPwa, ContaPwaDocument } from './schemas/conta-pwa.schema';
import { InscricaoPush, InscricaoPushDocument } from './schemas/inscricao-push.schema';
import { Notificacao, NotificacaoDocument } from './schemas/notificacao.schema';
import {
    ESTADOS,
    GUARDAR_DEPOIS_DE_SAIR_MS,
    ROTULO_DO_TIPO,
    type EstadoNotificacao,
    type TipoNotificacao,
} from './tipos';

/** Documentos por `insertMany`. Um envio para milhares não vira uma requisição gigante. */
export const LOTE_DE_INSERCAO = 500;

type Ator = { id?: string; name: string };

export type Destinatario = {
    id: string;
    email: string;
    nome: string | null;
    aparelhos: number;
    plataformas: string[];
    ultimoSucessoEm: Date | null;
};

export type ResumoDeLote = {
    loteId: string;
    tipo: TipoNotificacao;
    rotulo: string;
    detalhe: string;
    mostrarDetalhe: boolean;
    criadaPor: string;
    criadaEm: Date;
    enviarEm: Date;
    validaAte: Date;
    total: number;
    estados: Record<EstadoNotificacao, number>;
    exibidas: number;
    abertas: number;
};

export type PessoaDoLote = {
    email: string;
    nome: string | null;
    estado: EstadoNotificacao;
    motivo: string | null;
    tentativas: number;
    enviadaEm: Date | null;
    exibidaEm: Date | null;
    abertaEm: Date | null;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Avisos da equipe para as pessoas com conta no PWA.
 *
 * LÓGICA DO LUCIANO: o painel não envia nada. Ele escreve um documento pendente
 * por pessoa na fila que o PWA já tem, e o despachante de lá é o único que fala
 * com os serviços de push. Assim existe um só lugar com as chaves VAPID, as
 * retentativas e a regra de não mandar aviso vencido — e o painel pode cair sem
 * que nada do que já foi agendado deixe de sair.
 */
@Injectable()
export class NotificacoesService {
    private readonly logger = new Logger(NotificacoesService.name);

    constructor(
        @InjectModel(Notificacao.name, CONEXAO_PROTOTIPO)
        private readonly notificacaoModel: Model<NotificacaoDocument>,
        @InjectModel(ContaPwa.name, CONEXAO_PROTOTIPO)
        private readonly contaModel: Model<ContaPwaDocument>,
        @InjectModel(InscricaoPush.name, CONEXAO_PROTOTIPO)
        private readonly inscricaoModel: Model<InscricaoPushDocument>,
        private readonly activityService: ActivityService,
    ) { }

    /** Quem pode receber: as contas com ao menos um aparelho com avisos ativados. */
    async destinatarios(): Promise<{ contas: Destinatario[]; contasSemAparelho: number }> {
        const grupos = await this.inscricaoModel
            .aggregate<{ _id: string; aparelhos: number; userAgents: string[]; ultimoSucessoEm: Date | null }>([
                {
                    $group: {
                        _id: '$usuarioId',
                        aparelhos: { $sum: 1 },
                        userAgents: { $push: '$userAgent' },
                        ultimoSucessoEm: { $max: '$ultimoSucessoEm' },
                    },
                },
            ])
            .exec();

        const contas = await this.contaModel
            .find({ _id: { $in: grupos.map((g) => g._id) } })
            .select('_id email nome')
            .lean()
            .exec();
        const porId = new Map(contas.map((conta) => [String(conta._id), conta]));

        // Inscrição de conta que já não existe é resto de exclusão em andamento:
        // não aparece como opção.
        const lista: Destinatario[] = grupos
            .filter((grupo) => porId.has(grupo._id))
            .map((grupo) => {
                const conta = porId.get(grupo._id)!;
                return {
                    id: grupo._id,
                    email: conta.email,
                    nome: conta.nome ?? null,
                    aparelhos: grupo.aparelhos,
                    plataformas: [...new Set(grupo.userAgents.map((ua) => plataformaDe(ua)))],
                    ultimoSucessoEm: grupo.ultimoSucessoEm ?? null,
                };
            })
            .sort((a, b) => a.email.localeCompare(b.email, 'pt-BR'));

        const total = await this.contaModel.countDocuments({}).exec();
        return { contas: lista, contasSemAparelho: Math.max(total - lista.length, 0) };
    }

    /**
     * Agenda um aviso para uma lista de pessoas, ou para todas com avisos ativados.
     *
     * A auditoria guarda o tipo, quantas pessoas e a janela — nunca o texto nem
     * quem recebeu. "Lembrete de exame" para uma pessoa só, com o texto ao lado,
     * diria no histórico qual exame ela vai fazer.
     */
    async criar(dto: CriarNotificacaoDto, ator: Ator) {
        const detalhe = dto.detalhe.trim();
        if (!detalhe) throw new BadRequestException('Escreva o texto do aviso.');

        const agora = new Date();
        const enviarEm = dto.enviarEm ? new Date(dto.enviarEm) : agora;
        const validaAte = new Date(dto.validaAte);
        const problema = problemaNaJanela(enviarEm, validaAte, agora);
        if (problema) throw new BadRequestException(problema);

        const lista = dto.destinatarios ?? [];
        if (dto.todos && lista.length > 0) {
            throw new BadRequestException('Escolha "todas as contas" ou uma lista de pessoas, não os dois.');
        }
        if (!dto.todos && lista.length === 0) {
            throw new BadRequestException('Escolha quem recebe o aviso.');
        }

        const usuarioIds = dto.todos
            ? await this.contasComAparelho()
            : await this.contasExistentes([...new Set(lista)]);
        if (usuarioIds.length === 0) {
            throw new BadRequestException(
                dto.todos
                    ? 'Nenhuma conta tem avisos ativados ainda.'
                    : 'Nenhuma das contas escolhidas existe mais.',
            );
        }

        const loteId = randomUUID();
        const mostrarDetalhe = dto.mostrarDetalhe === true;
        const avisos = montarAvisos({
            loteId,
            usuarioIds,
            tipo: dto.tipo,
            detalhe,
            mostrarDetalhe,
            enviarEm,
            validaAte,
            criadaPor: ator.name,
            agora,
        });

        try {
            for (let inicio = 0; inicio < avisos.length; inicio += LOTE_DE_INSERCAO) {
                await this.notificacaoModel.collection.insertMany(
                    avisos.slice(inicio, inicio + LOTE_DE_INSERCAO) as never[],
                    { ordered: false },
                );
            }
        } catch (erro) {
            // Metade de um envio é pior que nenhum: a equipe tentaria de novo, e
            // quem já estava na primeira metade receberia duas vezes. O que
            // entrou é cancelado antes de o despachante pegar.
            this.logger.error(`Falha ao agendar o lote ${loteId}: ${(erro as Error).message}`);
            await this.notificacaoModel
                .updateMany({ loteId, estado: 'pendente' }, { $set: this.cancelamento(new Date()) })
                .exec()
                .catch(() => undefined);
            throw new ServiceUnavailableException(
                'Não foi possível agendar o aviso. Nada foi enviado; tente de novo em instantes.',
            );
        }

        void this.activityService.registrar({
            actor_name: ator.name,
            actor_id: ator.id,
            action: 'agendar',
            entity_type: 'notificacao',
            entity_id: loteId,
            target: `${ROTULO_DO_TIPO[dto.tipo]} para ${plural(usuarioIds.length, 'pessoa', 'pessoas')}`,
            after: {
                tipo: dto.tipo,
                destinatarios: usuarioIds.length,
                enviarEm: enviarEm.toISOString(),
                validaAte: validaAte.toISOString(),
                mostrarDetalhe,
            },
        });

        return {
            loteId,
            criadas: usuarioIds.length,
            ignorados: dto.todos ? 0 : new Set(lista).size - usuarioIds.length,
        };
    }

    /** Os envios mais recentes, com o andamento de cada um. */
    async lotes(): Promise<ResumoDeLote[]> {
        const contarEstado = (estado: EstadoNotificacao) => ({
            $sum: { $cond: [{ $eq: ['$estado', estado] }, 1, 0] },
        });
        // `$gt: null` e não `$ne: null`: numa expressão de agregação, campo
        // ausente não é igual a null, e contaria como exibida.
        const contarPreenchido = (campo: string) => ({
            $sum: { $cond: [{ $gt: [`$${campo}`, null] }, 1, 0] },
        });

        const linhas = await this.notificacaoModel
            .aggregate<Omit<ResumoDeLote, 'loteId' | 'rotulo' | 'estados'> & { _id: string } & Record<EstadoNotificacao, number>>([
                { $match: { loteId: { $ne: null } } },
                { $sort: { criadaEm: 1 } },
                {
                    $group: {
                        _id: '$loteId',
                        tipo: { $first: '$tipo' },
                        detalhe: { $first: '$detalhe' },
                        mostrarDetalhe: { $first: '$mostrarDetalhe' },
                        criadaPor: { $first: '$criadaPor' },
                        criadaEm: { $min: '$criadaEm' },
                        // Retentativa empurra o `enviarEm` para frente; o menor é o agendado.
                        enviarEm: { $min: '$enviarEm' },
                        validaAte: { $first: '$validaAte' },
                        total: { $sum: 1 },
                        ...Object.fromEntries(ESTADOS.map((estado) => [estado, contarEstado(estado)])),
                        exibidas: contarPreenchido('exibidaEm'),
                        abertas: contarPreenchido('abertaEm'),
                    },
                },
                { $sort: { criadaEm: -1 } },
                { $limit: 50 },
            ])
            .exec();

        return linhas.map((linha) => ({
            loteId: linha._id,
            tipo: linha.tipo,
            rotulo: ROTULO_DO_TIPO[linha.tipo] ?? linha.tipo,
            detalhe: linha.detalhe,
            mostrarDetalhe: linha.mostrarDetalhe,
            criadaPor: linha.criadaPor,
            criadaEm: linha.criadaEm,
            enviarEm: linha.enviarEm,
            validaAte: linha.validaAte,
            total: linha.total,
            estados: Object.fromEntries(ESTADOS.map((estado) => [estado, linha[estado] ?? 0])) as Record<
                EstadoNotificacao,
                number
            >,
            exibidas: linha.exibidas,
            abertas: linha.abertas,
        }));
    }

    /**
     * Um envio por dentro: como foi em cada plataforma e com cada pessoa.
     *
     * O recorte por plataforma é o que responde se o push serve ao projeto: a
     * taxa de exibição num Android e num iPhone instalado na tela de início.
     */
    async lote(loteId: string): Promise<{ loteId: string; plataformas: ResumoDePlataforma[]; pessoas: PessoaDoLote[] }> {
        const avisos = await this.notificacaoModel
            .find({ loteId })
            .select('usuarioId estado motivo tentativas enviadaEm exibidaEm abertaEm entregas')
            .lean()
            .exec();
        if (avisos.length === 0) throw new NotFoundException('Envio não encontrado');

        const contas = await this.contaModel
            .find({ _id: { $in: avisos.map((aviso) => aviso.usuarioId) } })
            .select('_id email nome')
            .lean()
            .exec();
        const porId = new Map(contas.map((conta) => [String(conta._id), conta]));

        const pessoas = avisos
            .map((aviso) => {
                const conta = porId.get(aviso.usuarioId);
                return {
                    // A pessoa pode ter apagado a conta depois do envio; o aviso
                    // dela some junto, mas pode ainda não ter sumido.
                    email: conta?.email ?? '(conta apagada)',
                    nome: conta?.nome ?? null,
                    estado: aviso.estado,
                    motivo: aviso.motivo ?? null,
                    tentativas: aviso.tentativas ?? 0,
                    enviadaEm: aviso.enviadaEm ?? null,
                    exibidaEm: aviso.exibidaEm ?? null,
                    abertaEm: aviso.abertaEm ?? null,
                };
            })
            .sort((a, b) => a.email.localeCompare(b.email, 'pt-BR'));

        return { loteId, plataformas: resumirPorPlataforma(avisos), pessoas };
    }

    /**
     * Cancela o que ainda não saiu.
     *
     * Só `pendente`: o que está `enviando` já foi reivindicado pelo despachante e
     * pode estar a caminho do aparelho. O filtro no `updateMany` é atômico por
     * documento, então não há corrida — ou o cancelamento chega antes da
     * reivindicação, ou a reivindicação chega antes e o aviso não é tocado.
     */
    async cancelar(loteId: string, ator: Ator): Promise<{ canceladas: number }> {
        const exemplo = await this.notificacaoModel.findOne({ loteId }).select('tipo').lean().exec();
        if (!exemplo) throw new NotFoundException('Envio não encontrado');

        const resultado = await this.notificacaoModel
            .updateMany({ loteId, estado: 'pendente' }, { $set: this.cancelamento(new Date()) })
            .exec();
        const canceladas = resultado.modifiedCount;

        if (canceladas > 0) {
            void this.activityService.registrar({
                actor_name: ator.name,
                actor_id: ator.id,
                action: 'cancelar',
                entity_type: 'notificacao',
                entity_id: loteId,
                target: `${ROTULO_DO_TIPO[exemplo.tipo] ?? exemplo.tipo} (${plural(canceladas, 'pendente', 'pendentes')})`,
                after: { canceladas },
            });
        }

        return { canceladas };
    }

    /** Sai da fila como o despachante faz: sem trava, e com prazo para o TTL apagar. */
    private cancelamento(agora: Date) {
        return {
            estado: 'cancelada' as const,
            motivo: 'cancelada no painel',
            travadaAte: null,
            expiraEm: new Date(agora.getTime() + GUARDAR_DEPOIS_DE_SAIR_MS),
        };
    }

    private async contasComAparelho(): Promise<string[]> {
        const ids = (await this.inscricaoModel.distinct('usuarioId').exec()) as string[];
        return this.contasExistentes(ids);
    }

    /** Os ids que correspondem a contas que ainda existem, na ordem recebida. */
    private async contasExistentes(ids: string[]): Promise<string[]> {
        if (ids.length === 0) return [];
        const existentes = await this.contaModel.find({ _id: { $in: ids } }).select('_id').lean().exec();
        const conjunto = new Set(existentes.map((conta) => String(conta._id)));
        return ids.filter((id) => conjunto.has(id));
    }
}
