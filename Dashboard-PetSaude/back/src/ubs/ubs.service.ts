import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import type { Periodo } from '../conversas/conversas.service';
import { intervaloDoPeriodo } from '../conversas/periodo';
import { Mensagem, MensagemDocument } from '../conversas/schemas/mensagem.schema';
import { Sessao, SessaoDocument } from '../conversas/schemas/sessao.schema';
import {
    chaveDaGrafia,
    chaveDeUbs,
    identificarUbs,
    type ComoIdentificou,
    type UnidadeParaBusca,
} from './identificar-ubs';
import { Ubs, UbsDocument } from './schemas/ubs.schema';
import { UNIDADES_INICIAIS } from './unidades-iniciais';

type Ator = { id?: string; name: string };
type Unidade = UnidadeParaBusca & { nome: string };

type ContagemDaSessao = { _id: string; perguntas: number; semResposta: number; negativos: number; positivos: number };

type Acumulado = {
    conversas: number;
    perguntas: number;
    semResposta: number;
    negativos: number;
    positivos: number;
    somaNotas: number;
    notas: number;
    ultimaEm: Date | null;
};

const linhaVazia = (): Acumulado => ({
    conversas: 0, perguntas: 0, semResposta: 0, negativos: 0, positivos: 0, somaNotas: 0, notas: 0, ultimaEm: null,
});

function somar(
    linha: Acumulado,
    contagem: ContagemDaSessao,
    sessao: { iniciadaEm?: Date; avaliacao?: { estrelas?: number | null } | null },
) {
    linha.conversas++;
    linha.perguntas += contagem.perguntas;
    linha.semResposta += contagem.semResposta;
    linha.negativos += contagem.negativos;
    linha.positivos += contagem.positivos;
    const estrelas = sessao.avaliacao?.estrelas;
    if (typeof estrelas === 'number') {
        linha.somaNotas += estrelas;
        linha.notas++;
    }
    if (sessao.iniciadaEm && (!linha.ultimaEm || sessao.iniciadaEm > linha.ultimaEm)) linha.ultimaEm = sessao.iniciadaEm;
}

const umaCasa = (valor: number) => Math.round(valor * 10) / 10;

/** Em percentual de uma casa: com dezenas de conversas, mais casas seriam ruído. */
function resumir(linha: Acumulado, base: number) {
    return {
        conversas: linha.conversas,
        perguntas: linha.perguntas,
        semResposta: linha.semResposta,
        negativos: linha.negativos,
        positivos: linha.positivos,
        avaliacoes: linha.notas,
        notaMedia: linha.notas ? umaCasa(linha.somaNotas / linha.notas) : null,
        ultimaEm: linha.ultimaEm,
        percentual: base ? umaCasa((linha.conversas / base) * 100) : 0,
        percentualSemResposta: linha.perguntas ? umaCasa((linha.semResposta / linha.perguntas) * 100) : null,
    };
}

const NAO_ENCONTRADA = 'UBS não encontrada. Ela pode ter sido removida: atualize a página e tente de novo.';

/**
 * As UBS de onde vêm as conversas.
 *
 * O PWA grava o texto como a pessoa escreveu, e a identificação acontece aqui,
 * na leitura. É o que faz uma grafia corrigida hoje valer também para as
 * conversas de ontem, sem reprocessar nada.
 *
 * Sem paginação e com a agregação em memória, como em ConversasService: a escala
 * do teste é de dezenas a centenas de sessões.
 */
@Injectable()
export class UbsService {
    constructor(
        @InjectModel(Ubs.name)
        private readonly ubsModel: Model<UbsDocument>,
        @InjectModel(Sessao.name, CONEXAO_PROTOTIPO)
        private readonly sessaoModel: Model<SessaoDocument>,
        @InjectModel(Mensagem.name, CONEXAO_PROTOTIPO)
        private readonly mensagemModel: Model<MensagemDocument>,
        private readonly activityService: ActivityService,
    ) { }

    private async unidades(): Promise<Unidade[]> {
        // Com a coleção vazia, toda resposta cairia em "para revisar".
        if ((await this.ubsModel.estimatedDocumentCount().exec()) === 0) {
            const criadaEm = new Date();
            // Duas instâncias subindo juntas colidem no índice único, e uma
            // delas ter inserido é o resultado que se queria.
            await this.ubsModel
                .insertMany(
                    UNIDADES_INICIAIS.map((nome) => ({ nome, chave: chaveDeUbs(nome), apelidos: [], criadaEm })),
                    { ordered: false },
                )
                .catch(() => undefined);
        }

        const lista = await this.ubsModel.find().sort({ nome: 1 }).lean().exec();
        return lista.map((u) => ({
            id: String(u._id),
            nome: u.nome,
            chave: u.chave,
            apelidos: u.apelidos ?? [],
        }));
    }

    /** Para a lista de conversas: dá o nome da UBS de cada uma, sem consultar o banco a cada linha. */
    async nomeador(): Promise<(ubs?: { texto: string | null } | null) => string | null> {
        const unidades = await this.unidades();
        return (ubs) => {
            if (!ubs?.texto) return null;
            const achada = identificarUbs(ubs.texto, unidades);
            return unidades.find((u) => u.id === achada?.id)?.nome ?? null;
        };
    }

    /** Os números do período, e todas as grafias que já chegaram. */
    async painel(periodo: Periodo = 'tudo', dia?: string) {
        const unidades = await this.unidades();
        const intervalo = intervaloDoPeriodo(periodo, dia);

        const noPeriodo = await this.sessaoModel
            .find(intervalo ? { iniciadaEm: intervalo } : {})
            .select('_id ubs iniciadaEm avaliacao')
            .lean()
            .exec();

        const contagem: ContagemDaSessao[] = await this.mensagemModel
            .aggregate([
                { $match: { sessaoId: { $in: noPeriodo.map((s) => s._id) } } },
                {
                    $group: {
                        _id: '$sessaoId',
                        perguntas: { $sum: { $cond: [{ $eq: ['$papel', 'user'] }, 1, 0] } },
                        semResposta: { $sum: { $cond: [{ $eq: ['$semResposta', true] }, 1, 0] } },
                        negativos: { $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] } },
                        positivos: { $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] } },
                    },
                },
            ])
            .exec();
        const porSessao = new Map(contagem.map((c) => [c._id, c]));

        const porUbs = new Map(unidades.map((u) => [u.id, linhaVazia()]));
        const geral = linhaVazia();
        let conversas = 0;
        let identificadas = 0;
        let paraRevisar = 0;
        let naoInformaram = 0;
        let anteriores = 0;

        for (const sessao of noPeriodo) {
            // Sessão sem pergunta é visita, não conversa: a mesma regra das
            // estatísticas de Conversas, para os dois totais baterem.
            const daSessao = porSessao.get(sessao._id);
            if (!daSessao?.perguntas) continue;
            conversas++;
            somar(geral, daSessao, sessao);

            if (!sessao.ubs) {
                anteriores++;
            } else if (sessao.ubs.texto === null) {
                naoInformaram++;
            } else {
                const achada = identificarUbs(sessao.ubs.texto, unidades);
                const linha = achada && porUbs.get(achada.id);
                if (linha) {
                    identificadas++;
                    somar(linha, daSessao, sessao);
                } else {
                    paraRevisar++;
                }
            }
        }

        return {
            conversas,
            identificadas,
            paraRevisar,
            naoInformaram,
            // Conversas de antes de a pergunta existir: separadas para não
            // parecerem gente que se recusou a responder.
            anteriores,
            // A referência para ler cada UBS: "20% sem resposta" só diz algo ao
            // lado da taxa de todas as conversas do período.
            geral: resumir(geral, conversas),
            porUbs: unidades
                .map((u) => ({ id: u.id, nome: u.nome, ...resumir(porUbs.get(u.id) ?? linhaVazia(), identificadas) }))
                .sort((a, b) => b.conversas - a.conversas || a.nome.localeCompare(b.nome, 'pt-BR')),
            grafias: await this.grafias(unidades),
        };
    }

    /**
     * Cada jeito diferente de escrever, e no que deu.
     *
     * Não obedece ao período: um texto sem identificar não pode sumir da fila
     * só porque alguém olhou o recorte de hoje.
     */
    private async grafias(unidades: Unidade[]) {
        const comTexto = await this.sessaoModel
            .find({ 'ubs.texto': { $type: 'string' } })
            .select('ubs')
            .lean()
            .exec();

        const grupos = new Map<string, Map<string, number>>();
        for (const { ubs } of comTexto) {
            const texto = ubs!.texto as string;
            const chave = chaveDaGrafia(texto);
            const grupo = grupos.get(chave) ?? new Map<string, number>();
            grupo.set(texto, (grupo.get(texto) ?? 0) + 1);
            grupos.set(chave, grupo);
        }

        const prioridade = (como: ComoIdentificou | null) => (como === null ? 0 : como === 'aproximada' ? 1 : 2);

        return [...grupos.entries()]
            .map(([chave, textos]) => {
                const [texto] = [...textos.entries()].sort((a, b) => b[1] - a[1])[0];
                const achada = identificarUbs(texto, unidades);
                return {
                    chave,
                    texto,
                    vezes: [...textos.values()].reduce((a, b) => a + b, 0),
                    ubsId: achada?.id ?? null,
                    ubsNome: unidades.find((u) => u.id === achada?.id)?.nome ?? null,
                    como: achada?.como ?? null,
                };
            })
            .sort((a, b) => prioridade(a.como) - prioridade(b.como) || b.vezes - a.vezes);
    }

    private chaveValida(nome: string): string {
        const chave = chaveDeUbs(nome);
        if (!chave) throw new BadRequestException('Escreva o nome da unidade, e não só "UBS" ou "ESF".');
        return chave;
    }

    private registrar(acao: string, target: string, ator: Ator, entityId?: string, after?: Record<string, unknown>) {
        void this.activityService.registrar({
            actor_name: ator.name,
            actor_id: ator.id,
            action: acao,
            entity_type: 'ubs',
            entity_id: entityId,
            target,
            after,
        });
    }

    async criar(nome: string, ator: Ator) {
        const limpo = nome.trim();
        const chave = this.chaveValida(limpo);
        if (await this.ubsModel.exists({ chave }).exec()) {
            throw new ConflictException('Já existe uma UBS com esse nome na lista.');
        }

        // Se alguém já tinha apontado essa grafia para outra unidade, agora ela é nome oficial.
        await this.ubsModel.updateMany({ apelidos: chave }, { $pull: { apelidos: chave } }).exec();
        const criada = await this.ubsModel.create({ nome: limpo, chave, apelidos: [], criadaEm: new Date(), criadaPor: ator.name });
        this.registrar('inserir', limpo, ator, String(criada._id));
        return { id: String(criada._id), nome: limpo };
    }

    async renomear(id: string, nome: string, ator: Ator) {
        if (!isValidObjectId(id)) throw new NotFoundException(NAO_ENCONTRADA);
        const limpo = nome.trim();
        const chave = this.chaveValida(limpo);

        const atual = await this.ubsModel.findById(id).exec();
        if (!atual) throw new NotFoundException(NAO_ENCONTRADA);
        if (chave !== atual.chave && (await this.ubsModel.exists({ chave }).exec())) {
            throw new ConflictException('Já existe uma UBS com esse nome na lista.');
        }

        // O nome antigo vira apelido: quem o digitou continua contando aqui.
        if (chave !== atual.chave) atual.apelidos = [...new Set([...atual.apelidos, atual.chave])];
        atual.apelidos = atual.apelidos.filter((a) => a !== chave);
        const antes = atual.nome;
        atual.nome = limpo;
        atual.chave = chave;
        await atual.save();

        this.registrar('editar', `${antes} → ${limpo}`, ator, id);
        return { id, nome: limpo };
    }

    async remover(id: string, ator: Ator) {
        if (!isValidObjectId(id)) throw new NotFoundException(NAO_ENCONTRADA);
        const removida = await this.ubsModel.findByIdAndDelete(id).exec();
        if (!removida) throw new NotFoundException(NAO_ENCONTRADA);
        this.registrar('excluir', removida.nome, ator, id);
        return { ok: true };
    }

    /**
     * Aponta uma grafia para a UBS certa, e vale para trás.
     *
     * A auditoria guarda a unidade, e não o texto: quem escreveu foi um cidadão.
     */
    async corrigirGrafia(chave: string, ubsId: string, ator: Ator) {
        const destino = await this.ubsModel.findById(ubsId).exec();
        if (!destino) throw new NotFoundException(NAO_ENCONTRADA);

        // Apontar para a UBS que o texto já tem não muda nenhum número, e um
        // registro de correção no histórico daria a entender que mudou.
        if (identificarUbs(chave, await this.unidades())?.id === ubsId) return { ok: true, mudou: false };

        const donaDoNome = await this.ubsModel.findOne({ chave }).select('_id nome').lean().exec();
        if (donaDoNome && String(donaDoNome._id) !== ubsId) {
            throw new ConflictException(`Esse texto é o nome da ${donaDoNome.nome}. Para mudar, renomeie a unidade.`);
        }

        await this.ubsModel.updateMany({ apelidos: chave }, { $pull: { apelidos: chave } }).exec();
        if (!donaDoNome) await this.ubsModel.updateOne({ _id: ubsId }, { $addToSet: { apelidos: chave } }).exec();

        this.registrar('corrigir_grafia', destino.nome, ator, ubsId);
        return { ok: true };
    }

    /**
     * Apaga das conversas um texto que não é nome de unidade.
     *
     * Alguém pode ter escrito o próprio nome ou um relato. Em vez de marcar para
     * ignorar, o que deixaria o texto guardado, ele sai das sessões, e elas
     * passam a contar como "não informaram".
     */
    async descartarGrafia(chave: string, ator: Ator) {
        const comTexto = await this.sessaoModel
            .find({ 'ubs.texto': { $type: 'string' } })
            .select('ubs')
            .lean()
            .exec();
        const ids = comTexto.filter((s) => chaveDaGrafia(s.ubs!.texto as string) === chave).map((s) => s._id);

        const { modifiedCount } = await this.sessaoModel
            .updateMany({ _id: { $in: ids } }, { $set: { 'ubs.texto': null } })
            .exec();

        this.registrar('descartar_grafia', 'Texto que não era nome de UBS', ator, undefined, { conversas: modifiedCount });
        return { ok: true, conversas: modifiedCount };
    }
}
