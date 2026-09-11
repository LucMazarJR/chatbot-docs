import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, type PipelineStage } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { Faq, FaqDocument } from '../faqs/schemas/faq.schema';
import { chaveDeCategoria } from './chave';
import { Categoria, CategoriaDocument } from './schemas/categoria.schema';

export type CategoriaListada = {
    id: string;
    nome: string;
    chave: string;
    descricao: string;
    ativa: boolean;
    criadaEm: Date;
    criadaPor?: string;
    /** Quantas FAQs ativas apontam para este nome. */
    faqs: number;
};

/** Por que uma FAQ foi parar na lista de revisão. */
export type MotivoRevisao =
    /** Campo `category` vazio. */
    | 'sem_categoria'
    /** A chave bate com uma categoria da lista, mas a grafia é outra. */
    | 'variante'
    /** A categoria existe na lista, mas foi aposentada. */
    | 'inativa'
    /** Nenhuma categoria da lista corresponde. Precisa de decisão humana. */
    | 'fora_da_lista';

export type GrupoRevisao = {
    /** O valor como está gravado nas FAQs. */
    categoria: string;
    motivo: MotivoRevisao;
    /** Para 'variante', a grafia oficial da lista. */
    sugestao?: string;
    quantidade: number;
    exemplos: { id: string; question: string }[];
};

@Injectable()
export class CategoriasService {
    private readonly logger = new Logger(CategoriasService.name);

    constructor(
        @InjectModel(Categoria.name)
        private readonly categoriaModel: Model<CategoriaDocument>,
        @InjectModel(Faq.name) private readonly faqModel: Model<FaqDocument>,
        private readonly activityService: ActivityService,
    ) { }

    /** Quantas FAQs ativas existem por valor gravado em `category`. */
    private async contagemPorCategoria(): Promise<Map<string, number>> {
        const linhas = await this.faqModel
            .aggregate<{ _id: string; count: number }>([
                { $match: { isActive: true } },
                { $group: { _id: { $ifNull: ['$category', ''] }, count: { $sum: 1 } } },
            ])
            .exec();

        // Agrupado pela CHAVE, e não pelo nome: é isso que faz "Exames" e
        // "exames" somarem no contador da categoria oficial em vez de a lista
        // mostrar 0 FAQs para uma categoria que na prática tem 40.
        const porChave = new Map<string, number>();
        for (const linha of linhas) {
            const chave = chaveDeCategoria(linha._id);
            porChave.set(chave, (porChave.get(chave) ?? 0) + linha.count);
        }
        return porChave;
    }

    async listar(incluirInativas = false): Promise<{
        categorias: CategoriaListada[];
        total: number;
        totalAtivas: number;
    }> {
        const filtro = incluirInativas ? {} : { ativa: true };
        const [docs, contagem] = await Promise.all([
            this.categoriaModel.find(filtro).lean().exec(),
            this.contagemPorCategoria(),
        ]);

        const categorias = docs
            .map((doc) => ({
                id: String(doc._id),
                nome: doc.nome,
                chave: doc.chave,
                descricao: doc.descricao ?? '',
                ativa: doc.ativa ?? true,
                criadaEm: doc.criadaEm,
                criadaPor: doc.criadaPor,
                faqs: contagem.get(doc.chave) ?? 0,
            }))
            // localeCompare pt-BR, como no getCategories das FAQs: a ordenação
            // do banco é por bytes e jogaria as acentuadas para o fim.
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        return {
            categorias,
            total: categorias.length,
            totalAtivas: categorias.filter((c) => c.ativa).length,
        };
    }

    /** A grafia oficial de cada chave. É o contrato que o resto do sistema valida. */
    async mapaOficial(): Promise<Map<string, { nome: string; ativa: boolean }>> {
        const docs = await this.categoriaModel.find().select('nome chave ativa').lean().exec();
        return new Map(
            docs.map((d) => [d.chave, { nome: d.nome, ativa: d.ativa ?? true }]),
        );
    }

    private nomeLimpo(nome: string): string {
        const limpo = (nome ?? '').replace(/\s+/g, ' ').trim();
        if (limpo.length < 2 || limpo.length > 60) {
            throw new BadRequestException('O nome da categoria precisa ter de 2 a 60 caracteres');
        }
        return limpo;
    }

    async criar(
        dados: { nome: string; descricao?: string },
        actor: { id?: string; name: string },
    ): Promise<CategoriaListada> {
        const nome = this.nomeLimpo(dados.nome);
        const chave = chaveDeCategoria(nome);

        const jaExiste = await this.categoriaModel.findOne({ chave }).lean().exec();
        if (jaExiste) {
            throw new ConflictException(
                `A categoria "${jaExiste.nome}" já existe — é o mesmo assunto escrito de outro jeito`,
            );
        }

        const doc = await new this.categoriaModel({
            nome,
            chave,
            descricao: (dados.descricao ?? '').trim(),
            ativa: true,
            criadaEm: new Date(),
            criadaPor: actor.name,
        }).save();

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'inserir',
            entity_type: 'categoria',
            entity_id: String(doc._id),
            target: nome,
        });

        const contagem = await this.contagemPorCategoria();
        return {
            id: String(doc._id),
            nome,
            chave,
            descricao: doc.descricao,
            ativa: true,
            criadaEm: doc.criadaEm,
            criadaPor: doc.criadaPor,
            faqs: contagem.get(chave) ?? 0,
        };
    }

    /**
     * Renomear, descrever ou aposentar.
     *
     * LÓGICA DO LUCIANO: renomear CASCATEIA para as FAQs, e não tem como não
     * cascatear. As FAQs guardam o nome da categoria, não o id — é assim que a
     * ingestão Python e o nó do n8n leem a coleção. Sem a cascata, renomear
     * "exames" para "Exames" deixaria as 40 FAQs apontando para um nome que já
     * não está na lista, e todas cairiam na tela de revisão de uma vez, para
     * serem corrigidas à mão uma a uma.
     *
     * O que a cascata NÃO faz é regerar os vetores. O nome da categoria entra no
     * texto embedado ("Assunto: ..."), então as FAQs renomeadas ficam com vetor
     * descrevendo o nome antigo. Regerar aqui significaria uma chamada ao Gemini
     * por FAQ dentro de uma requisição HTTP — lento, caro e sem como acompanhar.
     * Em vez disso a resposta devolve `reindexar`, e quem renomeou decide quando
     * rodar o backfill, que já sabe fazer isso por categoria, com progresso e
     * parada.
     */
    async atualizar(
        id: string,
        dados: { nome?: string; descricao?: string; ativa?: boolean },
        actor: { id?: string; name: string },
    ): Promise<{ ok: true; renomeadas: number; reindexar: number }> {
        if (!isValidObjectId(id)) throw new NotFoundException('Categoria nao encontrada');
        const doc = await this.categoriaModel.findById(id).exec();
        if (!doc) throw new NotFoundException('Categoria nao encontrada');

        const antes = { nome: doc.nome, descricao: doc.descricao, ativa: doc.ativa };
        let renomeadas = 0;

        if (dados.nome !== undefined) {
            const nome = this.nomeLimpo(dados.nome);
            const chave = chaveDeCategoria(nome);

            if (chave !== doc.chave) {
                const conflito = await this.categoriaModel.findOne({ chave }).lean().exec();
                if (conflito) {
                    throw new ConflictException(
                        `Já existe a categoria "${conflito.nome}" com esse mesmo nome`,
                    );
                }
            }

            if (nome !== doc.nome) {
                renomeadas = await this.renomearNasFaqs(doc.chave, nome);
                doc.nome = nome;
                doc.chave = chave;
            }
        }

        if (dados.descricao !== undefined) doc.descricao = dados.descricao.trim();
        if (dados.ativa !== undefined) doc.ativa = dados.ativa;

        doc.atualizadaEm = new Date();
        doc.atualizadaPor = actor.name;
        await doc.save();

        const depois = { nome: doc.nome, descricao: doc.descricao, ativa: doc.ativa };
        const mudou = (Object.keys(antes) as (keyof typeof antes)[]).filter(
            (c) => antes[c] !== depois[c],
        );

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: dados.ativa === false ? 'desativar' : 'editar',
            entity_type: 'categoria',
            entity_id: id,
            target: doc.nome,
            before: Object.fromEntries(mudou.map((c) => [c, antes[c]])),
            after: Object.fromEntries(mudou.map((c) => [c, depois[c]])),
        });

        return { ok: true, renomeadas, reindexar: renomeadas };
    }

    /**
     * Reescreve `category` e `text` das FAQs que usavam qualquer grafia da
     * chave antiga. O `text` precisa ir junto: é o campo que o nó Vector Store
     * do n8n devolve como trecho, e deixá-lo com o nome velho faria a resposta
     * do chatbot citar um assunto que já não existe.
     *
     * O content_hash NÃO muda — ele é MD5(pergunta|resposta) e não inclui a
     * categoria, de propósito (ver faqs.service.ts).
     */
    private async renomearNasFaqs(chaveAntiga: string, nomeNovo: string): Promise<number> {
        const docs = await this.faqModel
            .find({ isActive: true })
            .select('category question answer')
            .lean()
            .exec();

        // Quem já está com a grafia de destino fica de fora: reescrever daria o
        // mesmo documento, mas entraria na conta de `reindexar` e mandaria
        // regerar vetor de FAQ que não mudou — cota gasta à toa.
        const alvos = docs.filter(
            (d) => chaveDeCategoria(d.category) === chaveAntiga && d.category !== nomeNovo,
        );
        if (alvos.length === 0) return 0;

        const operacoes = alvos.map((d) => ({
            updateOne: {
                filter: { _id: d._id },
                update: {
                    $set: {
                        category: nomeNovo,
                        text: [
                            `Assunto: ${nomeNovo}`,
                            `Pergunta: ${d.question ?? ''}`,
                            `Resposta: ${d.answer ?? ''}`,
                        ].join('\n'),
                    },
                },
            },
        }));

        await this.faqModel.bulkWrite(operacoes);
        return alvos.length;
    }

    /**
     * Alinha as variantes de grafia à grafia oficial.
     *
     * LÓGICA DO LUCIANO: é a ação que resolve a maior parte da bagunça, e é a
     * única da curadoria que não precisa de ninguém decidindo nada. "exames",
     * "EXAMES" e "Exames" são o mesmo assunto — a chave já diz isso. O que falta
     * é escrever todos do mesmo jeito, e isso é mecânico.
     *
     * Sai daqui com a mesma pendência do renomear: o nome entra no texto
     * embedado, então as FAQs ajustadas ficam com vetor descrevendo a grafia
     * antiga. Vale o mesmo caminho — a resposta diz quantas, e o backfill por
     * categoria reindexa quando alguém mandar.
     */
    async normalizarGrafia(
        id: string,
        actor: { id?: string; name: string },
    ): Promise<{ ok: true; ajustadas: number; reindexar: number }> {
        if (!isValidObjectId(id)) throw new NotFoundException('Categoria nao encontrada');
        const doc = await this.categoriaModel.findById(id).lean().exec();
        if (!doc) throw new NotFoundException('Categoria nao encontrada');

        const ajustadas = await this.renomearNasFaqs(doc.chave, doc.nome);

        if (ajustadas > 0) {
            void this.activityService.registrar({
                actor_name: actor.name,
                actor_id: actor.id,
                action: 'padronizar',
                entity_type: 'categoria',
                entity_id: id,
                target: doc.nome,
                after: { perguntas_ajustadas: ajustadas },
            });
        }

        return { ok: true, ajustadas, reindexar: ajustadas };
    }

    async remover(id: string, actor: { id?: string; name: string }): Promise<{ ok: true }> {
        if (!isValidObjectId(id)) throw new NotFoundException('Categoria nao encontrada');
        const doc = await this.categoriaModel.findById(id).exec();
        if (!doc) throw new NotFoundException('Categoria nao encontrada');

        const contagem = await this.contagemPorCategoria();
        const emUso = contagem.get(doc.chave) ?? 0;
        if (emUso > 0) {
            // Apagar deixaria as FAQs apontando para um nome que não existe mais
            // em lugar nenhum. Desativar responde "o que era isso?" e joga as
            // FAQs para a revisão, onde alguém decide o destino delas.
            throw new ConflictException(
                `${emUso} ${emUso === 1 ? 'pergunta usa' : 'perguntas usam'} esta categoria. ` +
                'Desative-a em vez de excluir, ou mova as perguntas antes.',
            );
        }

        await doc.deleteOne();

        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'excluir',
            entity_type: 'categoria',
            entity_id: id,
            target: doc.nome,
        });

        return { ok: true };
    }

    /**
     * As FAQs cuja categoria não fecha com a lista oficial, agrupadas pelo valor
     * que está gravado.
     *
     * Agrupado, e não FAQ por FAQ, porque o trabalho é de curadoria: o problema
     * real não são 2491 perguntas erradas, são poucas dezenas de nomes de
     * assunto a decidir — e resolver um nome resolve todas as perguntas dele de
     * uma vez.
     */
    async revisao(): Promise<{
        resumo: { faqs: number; grupos: number; porMotivo: Record<MotivoRevisao, number> };
        grupos: GrupoRevisao[];
        listaVazia: boolean;
    }> {
        const oficial = await this.mapaOficial();

        const pipeline: PipelineStage[] = [
            { $match: { isActive: true } },
            {
                $group: {
                    _id: { $ifNull: ['$category', ''] },
                    count: { $sum: 1 },
                    exemplos: { $push: { id: '$_id', question: '$question' } },
                },
            },
        ];
        const linhas = await this.faqModel
            .aggregate<{ _id: string; count: number; exemplos: { id: unknown; question: string }[] }>(
                pipeline,
            )
            .exec();

        const grupos: GrupoRevisao[] = [];
        for (const linha of linhas) {
            const categoria = (linha._id ?? '').trim();
            const chave = chaveDeCategoria(categoria);
            const naLista = oficial.get(chave);

            let motivo: MotivoRevisao;
            let sugestao: string | undefined;

            if (!categoria) {
                motivo = 'sem_categoria';
            } else if (!naLista) {
                motivo = 'fora_da_lista';
            } else if (!naLista.ativa) {
                motivo = 'inativa';
            } else if (naLista.nome !== categoria) {
                // Mesma chave, grafia diferente: é a duplicata por caixa/acento
                // que explica boa parte das 236 categorias da base.
                motivo = 'variante';
                sugestao = naLista.nome;
            } else {
                continue;
            }

            grupos.push({
                categoria,
                motivo,
                sugestao,
                quantidade: linha.count,
                exemplos: linha.exemplos
                    .slice(0, 3)
                    .map((e) => ({ id: String(e.id), question: e.question })),
            });
        }

        // Mais perguntas afetadas primeiro: é por onde o mutirão começa.
        grupos.sort((a, b) => b.quantidade - a.quantidade);

        const porMotivo: Record<MotivoRevisao, number> = {
            sem_categoria: 0,
            variante: 0,
            inativa: 0,
            fora_da_lista: 0,
        };
        for (const g of grupos) porMotivo[g.motivo] += g.quantidade;

        return {
            resumo: {
                faqs: grupos.reduce((soma, g) => soma + g.quantidade, 0),
                grupos: grupos.length,
                porMotivo,
            },
            // Com a lista vazia TODA FAQ cai em 'fora_da_lista', o que é
            // verdade e é inútil. A tela usa isto para explicar que o primeiro
            // passo é cadastrar os assuntos, em vez de mostrar 236 alertas.
            listaVazia: oficial.size === 0,
            grupos,
        };
    }
}
