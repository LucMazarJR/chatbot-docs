import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { CONEXAO_PROTOTIPO } from '../conversas/conexao';
import { Mensagem, MensagemDocument } from '../conversas/schemas/mensagem.schema';
import { FaqsService } from '../faqs/faqs.service';
import { GeminiService } from '../gemini/gemini.service';
import { JobsService } from '../jobs/jobs.service';
import { Rodada, RodadaDocument } from './schemas/rodada.schema';
import { Sugestao, SugestaoDocument } from './schemas/sugestao.schema';

export const JOB_CURADORIA = 'curadoria-lacunas';

/** Quantas lacunas por rodada. O mesmo número que o grupo pediu. */
export const TAMANHO_DA_RODADA = 10;

/** Uma lacuna da fila, já com a pergunta do cidadão e o que a busca achou. */
type Lacuna = {
    mensagemId: string;
    sessaoId: string;
    em: Date;
    pergunta: string;
    vizinhas: { faqId: string | null; question: string | null; score: number; previa: string | null }[];
};

/** O que se espera de volta do modelo. */
type GrupoSugerido = {
    perguntas: number[];
    pergunta: string;
    resposta?: string;
    categoria?: string | null;
    tags?: string[];
    faqRelacionada?: string | null;
    /**
     * `fora_de_escopo` não vira sugestão — a lacuna é encerrada e some da fila.
     *
     * LÓGICA DO LUCIANO: existe porque a fila real não é só conteúdo faltando.
     * Entre as 17 primeiras lacunas gravadas estavam "qual o melhor time de
     * futebol do brasil?", "quero contar meu cabelo" e "Hoje fiz muita coisa".
     * O chatbot acertou em não responder essas; sem esta saída, o modelo seria
     * obrigado a propor uma FAQ para cada uma, e a tela de aprovação encheria
     * de lixo justamente na primeira vez que alguém a abrisse.
     */
    tipo?: 'nova' | 'complemento' | 'fora_de_escopo';
    justificativa?: string;
};

@Injectable()
export class CuradoriaService {
    private readonly logger = new Logger(CuradoriaService.name);

    constructor(
        @InjectModel(Mensagem.name, CONEXAO_PROTOTIPO)
        private readonly mensagemModel: Model<MensagemDocument>,
        @InjectModel(Sugestao.name)
        private readonly sugestaoModel: Model<SugestaoDocument>,
        @InjectModel(Rodada.name)
        private readonly rodadaModel: Model<RodadaDocument>,
        private readonly geminiService: GeminiService,
        private readonly jobsService: JobsService,
        private readonly faqsService: FaqsService,
        private readonly activityService: ActivityService,
    ) { }

    /**
     * Quantas lacunas esperam análise.
     *
     * `curadoria` ausente conta como pendente: as mensagens gravadas antes de o
     * campo existir são lacunas legítimas e precisam entrar na fila.
     */
    private get filtroPendentes() {
        return { semResposta: true, curadoria: { $in: [null, 'pendente'] } };
    }

    async contarPendentes(): Promise<{ pendentes: number; prontoParaRodar: boolean; tamanhoDaRodada: number }> {
        const pendentes = await this.mensagemModel.countDocuments(this.filtroPendentes).exec();
        return {
            pendentes,
            prontoParaRodar: pendentes >= TAMANHO_DA_RODADA,
            tamanhoDaRodada: TAMANHO_DA_RODADA,
        };
    }

    /**
     * As próximas lacunas da fila, com a pergunta e as FAQs que a busca achou.
     *
     * LÓGICA DO LUCIANO: as FAQs vizinhas NÃO são buscadas de novo — elas já
     * estão gravadas em `trechosDebug` da própria resposta, com score e com o
     * veredito do corte, inclusive as que foram descartadas. É exatamente o que
     * o chatbot viu na hora. Refazer a busca custaria um embedding por lacuna,
     * daria um resultado possivelmente diferente (a base mudou desde então) e
     * responderia a outra pergunta: "o que a busca acharia hoje", em vez de "o
     * que ela achou quando a pessoa perguntou".
     */
    private async proximasLacunas(limite: number): Promise<Lacuna[]> {
        const respostas = await this.mensagemModel
            .find(this.filtroPendentes)
            .sort({ em: 1 })
            .limit(limite)
            .lean()
            .exec();

        if (respostas.length === 0) return [];

        // A pergunta do cidadão está na mensagem irmã, pareada pelo
        // correlationId — uma por troca.
        const correlationIds = respostas.map((r) => r.correlationId).filter(Boolean);
        const perguntas = await this.mensagemModel
            .find({ papel: 'user', correlationId: { $in: correlationIds } })
            .select('correlationId texto')
            .lean()
            .exec();

        const textoPorCorrelation = new Map(perguntas.map((p) => [p.correlationId, p.texto]));

        return respostas
            .map((resposta) => ({
                mensagemId: String(resposta._id),
                sessaoId: resposta.sessaoId,
                em: resposta.em,
                pergunta: textoPorCorrelation.get(resposta.correlationId) ?? '',
                vizinhas: (resposta.trechosDebug ?? []).map((t) => ({
                    faqId: t.faqId ?? null,
                    question: t.question ?? null,
                    score: t.score,
                    previa: t.previa ?? null,
                })),
            }))
            // Sem a pergunta não há o que analisar. Acontece quando a mensagem
            // do usuário foi apagada, ou quando a troca é anterior ao
            // correlationId.
            .filter((lacuna) => lacuna.pergunta.trim().length > 0);
    }

    async listarFila(limite = TAMANHO_DA_RODADA): Promise<Lacuna[]> {
        return this.proximasLacunas(Math.min(50, Math.max(1, limite)));
    }

    iniciarRodada(actor: { id?: string; name: string }) {
        const job = this.jobsService.criar(JOB_CURADORIA, TAMANHO_DA_RODADA, actor.name);
        void this.processar(job.id, actor);
        return { jobId: job.id, tipo: JOB_CURADORIA };
    }

    /**
     * Uma rodada: pega até 10 lacunas, manda UM prompt, grava as sugestões.
     *
     * LÓGICA DO LUCIANO: um prompt para as dez, e não dez prompts. Perguntas que
     * ninguém soube responder costumam vir em cacho — "onde fica a UBS", "como
     * chego na UBS", "qual o endereço do posto" são a mesma FAQ faltando. Uma
     * chamada por pergunta produziria três sugestões quase iguais, e a tela de
     * aprovação viraria trabalho repetido. Ver as dez juntas é o que permite
     * agrupar.
     */
    private async processar(jobId: string, actor: { id?: string; name: string }): Promise<void> {
        let rodada: RodadaDocument | null = null;

        try {
            const lacunas = await this.proximasLacunas(TAMANHO_DA_RODADA);

            if (lacunas.length === 0) {
                this.jobsService.finalizar(jobId, 'concluido', 'Não há perguntas sem resposta na fila.');
                return;
            }

            // O registro nasce ANTES da chamada ao modelo, com as perguntas já
            // congeladas. Criado depois, uma falha na chamada não deixaria
            // registro nenhum — e "rodei e não aconteceu nada" é exatamente o
            // caso em que alguém vai querer saber o que foi enviado.
            rodada = await new this.rodadaModel({
                estado: 'rodando',
                iniciadaEm: new Date(),
                atorNome: actor.name,
                atorId: actor.id,
                modelo: this.geminiService.modeloDeTexto,
                jobId,
                lacunas: lacunas.map((l) => ({
                    mensagemId: l.mensagemId,
                    sessaoId: l.sessaoId,
                    pergunta: l.pergunta,
                    vizinhas: l.vizinhas.slice(0, 5).map((v) => ({
                        faqId: v.faqId,
                        question: v.question,
                        score: v.score,
                    })),
                })),
            }).save();

            const grupos = await this.geminiService.gerarJson<{ grupos: GrupoSugerido[] }>(
                this.montarPrompt(lacunas),
            );

            // Guardado como texto, e antes de qualquer interpretação: é a única
            // forma de distinguir depois "o modelo errou" de "o código leu
            // errado o que ele devolveu".
            rodada.respostaBruta = JSON.stringify(grupos);
            await rodada.save();

            const lista = Array.isArray(grupos?.grupos) ? grupos.grupos : [];
            if (lista.length === 0) {
                await this.encerrarRodada(rodada, 'erro', 'Nenhum agrupamento devolvido.');
                this.jobsService.finalizar(
                    jobId,
                    'erro',
                    'O modelo não devolveu nenhum agrupamento. As perguntas seguem na fila: tente de novo em alguns minutos.',
                );
                return;
            }

            // As lacunas que o modelo classificou como fora de escopo saem da
            // fila sem virar sugestão.
            const foraDeEscopo: string[] = [];
            const sugestoesCriadas: string[] = [];

            for (const grupo of lista) {
                const daqui = (grupo.perguntas ?? [])
                    .map((indice) => lacunas[indice - 1])
                    .filter(Boolean);

                const origens = daqui.map((lacuna) => ({
                    sessaoId: lacuna.sessaoId,
                    mensagemId: lacuna.mensagemId,
                    pergunta: lacuna.pergunta,
                    em: lacuna.em,
                }));

                // Grupo que não aponta para nenhuma pergunta real é alucinação
                // de índice: sem origem, a sugestão não tem rastreabilidade
                // nenhuma, que é justamente a razão de ela existir.
                if (origens.length === 0) {
                    this.jobsService.incrementar(jobId, 'descartados');
                    continue;
                }

                if (grupo.tipo === 'fora_de_escopo') {
                    foraDeEscopo.push(...daqui.map((l) => l.mensagemId));
                    this.jobsService.incrementar(jobId, 'fora_de_escopo', daqui.length);
                    continue;
                }

                const criada = await new this.sugestaoModel({
                    estado: 'pendente',
                    tipo: grupo.tipo === 'complemento' ? 'complemento' : 'nova',
                    pergunta: (grupo.pergunta ?? '').trim(),
                    rascunhoResposta: (grupo.resposta ?? '').trim(),
                    categoriaSugerida: grupo.categoria?.trim() || null,
                    tagsSugeridas: (grupo.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
                    faqRelacionadaId: this.faqRelacionadaValida(grupo.faqRelacionada, daqui),
                    justificativa: (grupo.justificativa ?? '').trim(),
                    origens,
                    criadaEm: new Date(),
                    criadaPor: actor.name,
                    modelo: this.geminiService.modeloDeTexto,
                }).save();

                sugestoesCriadas.push(String(criada._id));
                this.jobsService.incrementar(jobId, 'sugestoes');
            }

            // Só marca como tratada DEPOIS de as sugestões estarem gravadas.
            // Invertido, uma falha no meio tiraria a lacuna da fila sem nada no
            // lugar — ela nunca mais seria analisada e ninguém saberia.
            //
            // Os dois estados ficam distintos de propósito: `descartada` diz que
            // a pergunta não era sobre saúde, e `processada` que ela virou (ou
            // entrou em) uma sugestão. Marcar tudo igual perderia a única
            // medida de quanto do "não encontrou" é lacuna de verdade — que é o
            // indicador que decide se a base precisa crescer.
            const descartadas = new Set(foraDeEscopo);
            const processadas = lacunas
                .map((l) => l.mensagemId)
                .filter((id) => !descartadas.has(id));

            if (processadas.length > 0) {
                await this.mensagemModel
                    .updateMany(
                        { _id: { $in: processadas } },
                        { $set: { curadoria: 'processada' } },
                    )
                    .exec();
            }
            if (foraDeEscopo.length > 0) {
                await this.mensagemModel
                    .updateMany(
                        { _id: { $in: foraDeEscopo } },
                        { $set: { curadoria: 'descartada' } },
                    )
                    .exec();
            }

            this.jobsService.avancar(jobId, lacunas.length);

            rodada.sugestoesCriadas = sugestoesCriadas;
            rodada.foraDeEscopo = foraDeEscopo;
            await this.encerrarRodada(rodada, 'concluida');

            void this.activityService.registrar({
                actor_name: actor.name,
                actor_id: actor.id,
                action: 'curadoria',
                entity_type: 'sistema',
                // O id da rodada é o que liga esta linha do histórico ao
                // registro completo: as perguntas que entraram e a resposta
                // crua do modelo.
                entity_id: String(rodada._id),
                target: `${lacunas.length} perguntas sem resposta analisadas`,
                after: {
                    sugestoes: sugestoesCriadas.length,
                    fora_de_escopo: foraDeEscopo.length,
                    modelo: this.geminiService.modeloDeTexto,
                },
            });

            this.jobsService.finalizar(jobId, 'concluido');
        } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : 'Falha inesperada.';

            if (GeminiService.ehErroDeCota(erro)) {
                await this.encerrarRodada(rodada, 'cota_esgotada', mensagem);
                this.jobsService.finalizar(
                    jobId,
                    'cota_esgotada',
                    'A cota da API do Gemini acabou. As lacunas seguem na fila — rode de novo amanha.',
                );
                return;
            }

            this.logger.error(`Curadoria ${jobId} falhou: ${mensagem}`);
            await this.encerrarRodada(rodada, 'erro', mensagem);
            this.jobsService.finalizar(jobId, 'erro', mensagem);
        }
    }

    /**
     * Fecha o registro da rodada.
     *
     * Nunca deixa a falha do registro derrubar a rodada: o histórico existe para
     * explicar o que aconteceu, e um histórico que interrompe a operação que ele
     * deveria descrever é pior que histórico nenhum — mesma regra do
     * ActivityService.
     */
    private async encerrarRodada(
        rodada: RodadaDocument | null,
        estado: 'concluida' | 'erro' | 'cota_esgotada',
        erro?: string,
    ): Promise<void> {
        if (!rodada) return;
        try {
            rodada.estado = estado;
            rodada.terminadaEm = new Date();
            rodada.erro = erro ?? null;
            await rodada.save();
        } catch (falha) {
            this.logger.error(
                `Nao foi possivel gravar a rodada de curadoria: ${
                    falha instanceof Error ? falha.message : falha
                }`,
            );
        }
    }

    /**
     * O histórico das análises, com o que entrou em cada uma.
     *
     * LÓGICA DO LUCIANO: a lista vem sem a `respostaBruta` e sem as vizinhas de
     * cada pergunta — são dezenas de KB por rodada, e a tela mostra dez rodadas.
     * Quem quiser o detalhe abre uma.
     */
    async listarRodadas(limite = 20) {
        const docs = await this.rodadaModel
            .find()
            .sort({ iniciadaEm: -1 })
            .limit(Math.min(50, Math.max(1, limite)))
            .select('-respostaBruta -lacunas.vizinhas')
            .lean()
            .exec();

        return docs.map((doc) => ({
            id: String(doc._id),
            estado: doc.estado,
            iniciadaEm: doc.iniciadaEm,
            terminadaEm: doc.terminadaEm ?? null,
            atorNome: doc.atorNome,
            modelo: doc.modelo ?? null,
            erro: doc.erro ?? null,
            perguntas: (doc.lacunas ?? []).map((l) => ({
                mensagemId: l.mensagemId,
                sessaoId: l.sessaoId,
                pergunta: l.pergunta,
            })),
            sugestoesCriadas: doc.sugestoesCriadas ?? [],
            foraDeEscopo: doc.foraDeEscopo ?? [],
        }));
    }

    /** Uma rodada inteira, incluindo o que o modelo devolveu palavra por palavra. */
    async detalharRodada(id: string) {
        if (!isValidObjectId(id)) throw new NotFoundException('Rodada não encontrada. Atualize a página de Sem resposta.');
        const doc = await this.rodadaModel.findById(id).lean().exec();
        if (!doc) throw new NotFoundException('Rodada não encontrada. Atualize a página de Sem resposta.');

        return {
            id: String(doc._id),
            estado: doc.estado,
            iniciadaEm: doc.iniciadaEm,
            terminadaEm: doc.terminadaEm ?? null,
            atorNome: doc.atorNome,
            modelo: doc.modelo ?? null,
            erro: doc.erro ?? null,
            respostaBruta: doc.respostaBruta ?? '',
            lacunas: (doc.lacunas ?? []).map((l) => ({
                mensagemId: l.mensagemId,
                sessaoId: l.sessaoId,
                pergunta: l.pergunta,
                vizinhas: (l.vizinhas ?? []).map((v) => ({
                    faqId: v.faqId ?? null,
                    question: v.question ?? null,
                    score: v.score,
                })),
            })),
            sugestoesCriadas: doc.sugestoesCriadas ?? [],
            foraDeEscopo: doc.foraDeEscopo ?? [],
        };
    }

    /**
     * Só aceita como FAQ relacionada um id que a busca realmente devolveu para
     * aquelas perguntas.
     *
     * LÓGICA DO LUCIANO: no primeiro ensaio contra dados reais o modelo devolveu
     * `faqRelacionada: "desconhecido"` — a palavra que o prompt usava como
     * rótulo para as FAQs antigas, que não têm id gravado. Guardado assim,
     * viraria um link para /faqs/desconhecido na tela de aprovação: um 404 que
     * ninguém consegue explicar, aparecendo na tela de quem está decidindo
     * conteúdo de saúde.
     *
     * A conferência não é só de formato. Um ObjectId com a forma certa mas
     * inventado apontaria para uma FAQ que não tem nada a ver com a pergunta, e
     * isso é pior que não apontar para nada. Exigir que o id esteja entre os
     * vizinhos DAQUELAS perguntas é o que torna a checagem verdadeira.
     */
    private faqRelacionadaValida(
        candidato: string | null | undefined,
        lacunas: Lacuna[],
    ): string | null {
        const id = (candidato ?? '').trim();
        if (!id || !isValidObjectId(id)) return null;

        const conhecidos = new Set(
            lacunas.flatMap((l) => l.vizinhas.map((v) => v.faqId).filter(Boolean)),
        );
        return conhecidos.has(id) ? id : null;
    }

    /**
     * O prompt.
     *
     * LÓGICA DO LUCIANO: a regra que mais importa aqui é a de NÃO inventar
     * resposta. Isto é orientação de saúde sobre medicamento e atendimento, na
     * voz do Ministério; um modelo preenchendo a lacuna com o que parece certo
     * produziria exatamente o texto que ninguém consegue auditar depois. Quando
     * as FAQs fornecidas não contêm a informação, a resposta vem vazia — e isso
     * é um resultado útil, não uma falha: é a confirmação de que aquilo é
     * conteúdo que falta de verdade, que foi a conclusão do primeiro teste com
     * participantes.
     */
    private montarPrompt(lacunas: Lacuna[]): string {
        const blocos = lacunas.map((lacuna, i) => {
            const vizinhas = lacuna.vizinhas
                .slice(0, 5)
                .map((v) => {
                    // O id só entra quando existe de verdade. Numa versão
                    // anterior aqui se escrevia "id: desconhecido" para os que
                    // não tinham, e o modelo devolveu literalmente
                    // `faqRelacionada: "desconhecido"` — que viraria um link
                    // quebrado na tela de aprovação. Rótulo que não é dado não
                    // deve parecer dado.
                    const identificacao = v.faqId
                        ? `id: ${v.faqId} | proximidade ${v.score.toFixed(3)}`
                        : `sem id | proximidade ${v.score.toFixed(3)}`;
                    return (
                        `    - [${identificacao}] ${v.question ?? '(sem pergunta)'}\n` +
                        `      ${(v.previa ?? '').replace(/\s+/g, ' ').slice(0, 200)}`
                    );
                })
                .join('\n');

            return [
                `${i + 1}. Pergunta do cidadao: "${lacuna.pergunta}"`,
                '   FAQs mais proximas que a busca encontrou (nenhuma foi boa o bastante):',
                vizinhas || '    - nenhuma',
            ].join('\n');
        });

        return [
            'Voce ajuda a equipe de saude a manter a base de perguntas frequentes de um',
            'servico publico de saude municipal. Abaixo estao perguntas reais de cidadaos que',
            'o chatbot NAO conseguiu responder, cada uma com as FAQs mais proximas que a',
            'busca encontrou.',
            '',
            'Sua tarefa:',
            '1. Agrupe as perguntas que pedem a MESMA coisa escrita de formas diferentes.',
            '2. Para cada grupo, escreva a pergunta canonica, do jeito que ela entraria na base.',
            '3. Diga se o grupo pede uma FAQ NOVA ou se e COMPLEMENTO de uma FAQ existente.',
            '   Em faqRelacionada, use APENAS um id que aparece na lista abaixo, copiado',
            '   exatamente. Se a FAQ proxima nao mostrar id, use null — nunca invente nem',
            '   escreva texto nesse campo.',
            '4. Se a entrada NAO for um pedido de informacao de saude ou de servico de saude',
            '   — assunto de fora, desabafo, teste, texto sem sentido —, use tipo',
            '   "fora_de_escopo". Nao invente FAQ para ela: o chatbot acertou em nao',
            '   responder. Pode juntar varias assim num grupo so.',
            '',
            'REGRA MAIS IMPORTANTE: nao invente orientacao de saude. Preencha "resposta"',
            'APENAS com informacao que esteja literalmente nas FAQs fornecidas, adaptada a',
            'pergunta. Se as FAQs fornecidas nao contiverem a informacao necessaria, deixe',
            '"resposta" como string vazia e explique em "justificativa" o que falta. Resposta',
            'vazia e um resultado correto e esperado.',
            '',
            'Nao sugira categoria nova por conta propria: use a categoria de uma das FAQs',
            'proximas, ou null.',
            '',
            'Responda em JSON, neste formato:',
            '{"grupos":[{"perguntas":[1,3],"pergunta":"...","resposta":"","categoria":null,',
            '"tags":["...","...","..."],"tipo":"nova","faqRelacionada":null,"justificativa":"..."}]}',
            '',
            'Para fora de escopo basta: {"perguntas":[2],"pergunta":"","tipo":"fora_de_escopo",',
            '"justificativa":"nao e pergunta de saude"}',
            '',
            'O campo "perguntas" lista os NUMEROS das perguntas do grupo, conforme a',
            'numeracao abaixo. Toda pergunta deve aparecer em exatamente um grupo.',
            '',
            'Perguntas:',
            '',
            ...blocos,
        ].join('\n');
    }

    async listarSugestoes(estado: 'pendente' | 'aprovada' | 'descartada' = 'pendente') {
        const docs = await this.sugestaoModel
            .find({ estado })
            .sort({ criadaEm: -1 })
            .limit(200)
            .lean()
            .exec();

        return {
            itens: docs.map((doc) => ({
                id: String(doc._id),
                estado: doc.estado,
                tipo: doc.tipo,
                pergunta: doc.pergunta,
                rascunhoResposta: doc.rascunhoResposta ?? '',
                categoriaSugerida: doc.categoriaSugerida ?? null,
                tagsSugeridas: doc.tagsSugeridas ?? [],
                faqRelacionadaId: doc.faqRelacionadaId ?? null,
                justificativa: doc.justificativa ?? '',
                origens: (doc.origens ?? []).map((o) => ({
                    sessaoId: o.sessaoId,
                    mensagemId: o.mensagemId,
                    pergunta: o.pergunta,
                    em: o.em,
                })),
                criadaEm: doc.criadaEm,
                criadaPor: doc.criadaPor ?? null,
                modelo: doc.modelo ?? null,
                faqCriadaId: doc.faqCriadaId ?? null,
            })),
            total: docs.length,
        };
    }

    /**
     * Aprovar cria a FAQ pelo MESMO caminho do formulário manual.
     *
     * LÓGICA DO LUCIANO: passa pelo createFaq de sempre — mesma validação, mesmo
     * embedding, mesmo registro de auditoria, e o ator é quem aprovou, não o
     * modelo. A pergunta e a resposta chegam aqui já revisadas pela tela: o que
     * o modelo escreveu é rascunho, e quem assina o conteúdo é uma pessoa.
     */
    async aprovar(
        id: string,
        dados: { question: string; answer: string; category?: string; tags?: string[] },
        actor: { id?: string; name: string },
    ) {
        const sugestao = await this.buscar(id);
        if (sugestao.estado !== 'pendente') {
            throw new BadRequestException('Esta sugestão já foi decidida por outra pessoa. Atualize a página para ver a lista atual.');
        }
        if (!dados.answer?.trim()) {
            throw new BadRequestException(
                'A resposta não pode ficar vazia. O rascunho vem vazio quando a base não tinha ' +
                'a informação: neste caso, alguém da saúde precisa escrever o texto.',
            );
        }

        const criada = await this.faqsService.createFaq(
            {
                question: dados.question,
                answer: dados.answer,
                category: dados.category,
                tags: dados.tags,
                source: 'Curadoria de perguntas sem resposta',
            },
            actor,
            // Fecha o rastro do outro lado: a sugestão aponta para a FAQ criada,
            // e a FAQ aponta de volta para a sugestão que a originou — que por
            // sua vez guarda as conversas em que a pergunta apareceu.
            { file_id: 'dashboard_curadoria', file_origin: `Sugestao ${id}` },
        );

        sugestao.estado = 'aprovada';
        sugestao.decididaEm = new Date();
        sugestao.decididaPor = actor.name;
        sugestao.faqCriadaId = criada.id;
        await sugestao.save();

        return { ok: true, faqId: criada.id, semEmbedding: criada.semEmbedding };
    }

    async descartar(id: string, actor: { id?: string; name: string }) {
        const sugestao = await this.buscar(id);
        if (sugestao.estado !== 'pendente') {
            throw new BadRequestException('Esta sugestão já foi decidida por outra pessoa. Atualize a página para ver a lista atual.');
        }

        sugestao.estado = 'descartada';
        sugestao.decididaEm = new Date();
        sugestao.decididaPor = actor.name;
        await sugestao.save();

        // Sem a pergunta da sugestão: ela é o modelo reescrevendo perguntas de
        // cidadãos, e o histórico guarda por anos o que ninguém pediu para
        // guardar. O id liga o registro à sugestão, que continua no banco.
        void this.activityService.registrar({
            actor_name: actor.name,
            actor_id: actor.id,
            action: 'descartar',
            entity_type: 'sistema',
            entity_id: id,
            target: `Sugestão de FAQ descartada (${sugestao.origens?.length ?? 0} perguntas de origem)`,
        });

        return { ok: true };
    }

    private async buscar(id: string): Promise<SugestaoDocument> {
        if (!isValidObjectId(id)) throw new NotFoundException('Sugestão não encontrada. Atualize a página de Sem resposta.');
        const doc = await this.sugestaoModel.findById(id).exec();
        if (!doc) throw new NotFoundException('Sugestão não encontrada. Atualize a página de Sem resposta.');
        return doc;
    }
}
