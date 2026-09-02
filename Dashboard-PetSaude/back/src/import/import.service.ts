import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { FaqsService } from '../faqs/faqs.service';
import { JobsService } from '../jobs/jobs.service';
import { CommitImportacaoDto, FaqImportadaDto } from './dto/importar.dto';

/** Limites de conteúdo — os mesmos do formulário manual, sem exceção. */
export const LIMITES = {
    perguntaMin: 5,
    perguntaMax: 300,
    respostaMin: 5,
    respostaMax: 4000,
    categoriaMin: 2,
    categoriaMax: 60,
    tagMin: 2,
    tagMax: 30,
    tagsMin: 3,
    fonteMax: 300,
} as const;

export type EstadoLinha = 'ok' | 'duplicada' | 'invalida';

export type FaqNormalizada = {
    question: string;
    answer: string;
    category: string;
    tags: string[];
    source: string;
};

export type LinhaValidada = {
    linha: number;
    estado: EstadoLinha;
    /**
     * A pergunta ja existe na base, mas com o texto um pouco diferente.
     *
     * Nao impede a importacao: pode ser exatamente o que se quer, quando se
     * reenvia um documento corrigido. Serve para a linha NAO vir marcada por
     * padrao, e para a pessoa ver o que esta prestes a duplicar.
     */
    parecida?: boolean;
    /** Vazio quando `ok`. Uma frase por problema, para aparecer ao lado da linha. */
    motivos: string[];
    contentHash: string;
    faq: FaqNormalizada;
};

export type ResultadoValidacao = {
    itens: LinhaValidada[];
    resumo: { total: number; ok: number; duplicadas: number; invalidas: number };
};

/** Nome do job, e a trava de "um de cada vez" é por este nome. */
export const JOB_IMPORTACAO = 'importacao-faqs';

@Injectable()
export class ImportService {
    private readonly logger = new Logger(ImportService.name);

    /** Quantas FAQs por bloco antes de devolver a vez ao event loop. */
    private static readonly TAMANHO_BLOCO = 10;

    constructor(
        private readonly faqsService: FaqsService,
        private readonly jobsService: JobsService,
    ) { }

    private texto(valor: unknown): string {
        if (valor === null || valor === undefined) return '';
        return String(valor).trim();
    }

    /**
     * Normaliza o que o script devolveu para a forma que o banco espera.
     *
     * O script é código do usuário: ele pode devolver tags como string única,
     * categoria como número, campo faltando. Nada disso deve virar exceção —
     * vira uma linha marcada na prévia.
     */
    private normalizar(bruta: FaqImportadaDto): FaqNormalizada {
        const tags = Array.isArray(bruta.tags)
            ? bruta.tags.map((t) => this.texto(t).toLowerCase()).filter(Boolean)
            : this.texto(bruta.tags)
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);

        return {
            question: this.texto(bruta.question),
            answer: this.texto(bruta.answer),
            category: this.texto(bruta.category).toLowerCase(),
            // Tag repetida na mesma FAQ não acrescenta nada e faria a contagem
            // de "3 tags" passar com uma palavra escrita três vezes.
            tags: [...new Set(tags)],
            source: this.texto(bruta.source),
        };
    }

    private motivosDe(faq: FaqNormalizada): string[] {
        const motivos: string[] = [];
        const L = LIMITES;

        if (faq.question.length < L.perguntaMin) {
            motivos.push(`A pergunta precisa ter ao menos ${L.perguntaMin} caracteres.`);
        } else if (faq.question.length > L.perguntaMax) {
            motivos.push(`A pergunta passa de ${L.perguntaMax} caracteres.`);
        }

        if (faq.answer.length < L.respostaMin) {
            motivos.push(`A resposta precisa ter ao menos ${L.respostaMin} caracteres.`);
        } else if (faq.answer.length > L.respostaMax) {
            motivos.push(`A resposta passa de ${L.respostaMax} caracteres.`);
        }

        // A guarda que existe desde a FAQ com pergunta, resposta e categoria
        // literalmente "teste", que foi indexada e citada numa conversa real.
        if (
            faq.question.length > 0 &&
            faq.question.toLowerCase() === faq.answer.toLowerCase()
        ) {
            motivos.push('A pergunta e a resposta sao iguais.');
        }

        if (faq.category.length < L.categoriaMin) {
            motivos.push('Informe um assunto de ao menos 2 caracteres.');
        } else if (faq.category.length > L.categoriaMax) {
            motivos.push(`O assunto passa de ${L.categoriaMax} caracteres.`);
        }

        if (faq.tags.length < L.tagsMin) {
            motivos.push(
                `Sao necessarias ao menos ${L.tagsMin} tags; esta linha tem ${faq.tags.length}.`,
            );
        }
        const tagsRuins = faq.tags.filter(
            (t) => t.length < L.tagMin || t.length > L.tagMax,
        );
        if (tagsRuins.length > 0) {
            motivos.push(
                `Tags fora do tamanho permitido (${L.tagMin} a ${L.tagMax} caracteres): ` +
                tagsRuins.join(', '),
            );
        }

        if (faq.source.length > L.fonteMax) {
            motivos.push(`A fonte passa de ${L.fonteMax} caracteres.`);
        }

        return motivos;
    }

    /**
     * Classifica cada linha antes de gravar qualquer coisa.
     *
     * Duplicadas são detectadas pelo content_hash, o mesmo MD5 que a ingestão
     * Python usa — reimportar o mesmo arquivo depois de uma interrupção não
     * duplica nada, e é isso que torna a importação retomável.
     */
    async validar(faqs: FaqImportadaDto[]): Promise<ResultadoValidacao> {
        const normalizadas = faqs.map((bruta, i) => {
            const faq = this.normalizar(bruta);
            const linhaBruta = Number(bruta.linha);
            return {
                // Sem `linha` vinda do script, cai para a posição no array — a
                // prévia precisa de algum ponteiro para a pessoa achar o erro.
                linha: Number.isFinite(linhaBruta) && linhaBruta > 0 ? linhaBruta : i + 1,
                faq,
                contentHash: this.faqsService.hashDeConteudo(faq.question, faq.answer),
                motivos: this.motivosDe(faq),
            };
        });

        // Só consulta o banco pelos hashes que têm chance de entrar: uma linha
        // inválida não vai ser gravada de qualquer jeito, e a lista do $in
        // fica menor.
        const candidatos = normalizadas.filter((n) => n.motivos.length === 0);
        const [jaExistem, parecidas] = await Promise.all([
            this.faqsService.hashesExistentes(candidatos.map((n) => n.contentHash)),
            this.faqsService.perguntasParecidasExistentes(
                candidatos.map((n) => this.faqsService.normalizarPergunta(n.faq.question)),
            ),
        ]);

        // Duplicata dentro do PRÓPRIO arquivo. Sem isto, a mesma pergunta
        // repetida duas vezes na planilha entraria duas vezes — o banco não
        // tem restrição de unicidade em content_hash, e a segunda cópia só
        // apareceria quando alguém estranhasse a contagem.
        const vistosNoArquivo = new Set<string>();

        const itens: LinhaValidada[] = normalizadas.map((n) => {
            let estado: EstadoLinha = 'invalida';
            let parecida = false;
            const motivos = [...n.motivos];

            if (motivos.length === 0) {
                if (jaExistem.has(n.contentHash)) {
                    estado = 'duplicada';
                    motivos.push('Esta pergunta e resposta ja existem na base.');
                } else if (vistosNoArquivo.has(n.contentHash)) {
                    estado = 'duplicada';
                    motivos.push('Repetida dentro do proprio arquivo.');
                } else {
                    estado = 'ok';
                    vistosNoArquivo.add(n.contentHash);

                    // Mesma pergunta, texto um pouco diferente. Nao bloqueia:
                    // reenviar um documento corrigido e um uso legitimo, e quem
                    // decide e quem esta olhando a previa.
                    if (parecidas.has(this.faqsService.normalizarPergunta(n.faq.question))) {
                        parecida = true;
                        motivos.push(
                            'Ja existe uma pergunta igual a esta na base, com o texto um pouco ' +
                            'diferente. Importar vai criar uma segunda copia.',
                        );
                    }
                }
            }

            return {
                linha: n.linha,
                estado,
                parecida,
                motivos,
                contentHash: n.contentHash,
                faq: n.faq,
            };
        });

        return {
            itens,
            resumo: {
                total: itens.length,
                ok: itens.filter((i) => i.estado === 'ok').length,
                duplicadas: itens.filter((i) => i.estado === 'duplicada').length,
                invalidas: itens.filter((i) => i.estado === 'invalida').length,
            },
        };
    }

    /**
     * Cria o job e devolve na hora. O trabalho continua em segundo plano.
     *
     * Devolver só quando terminasse seria mais simples e não funcionaria: cada
     * FAQ custa uma chamada de embedding ao Gemini, e 200 delas passam de
     * qualquer limite de tempo de requisição da Vercel ou do Render.
     */
    iniciarImportacao(dados: CommitImportacaoDto, actor: { id?: string; name: string }) {
        const job = this.jobsService.criar(JOB_IMPORTACAO, dados.faqs.length, actor.name);

        // Sem await: o laço avisa o progresso pelo próprio job.
        void this.processar(job.id, dados, actor);

        return { jobId: job.id, total: dados.faqs.length };
    }

    private async processar(
        jobId: string,
        dados: CommitImportacaoDto,
        actor: { id?: string; name: string },
    ): Promise<void> {
        // LOGICA DO LUCIANO: um id para o lote inteiro. Sem ele, importar 2000
        // linhas gravava 2000 registros de "inserir" indistinguiveis de 2000
        // insercoes manuais, e afogava o historico de alteracoes -- justamente
        // a tela que existe para achar o que alguem mexeu.
        const origemBase = {
            batch_id: randomUUID(),
            file_id: 'dashboard_import',
            file_origin: dados.nomeArquivo,
            import_script_id: dados.scriptId,
            import_script_version: dados.scriptVersion,
        };

        try {
            // Revalida no servidor. A prévia rodou no navegador e o cliente
            // poderia mandar qualquer coisa no commit — inclusive linhas que a
            // própria prévia tinha marcado como inválidas.
            const { itens } = await this.validar(dados.faqs);

            for (let i = 0; i < itens.length; i += ImportService.TAMANHO_BLOCO) {
                if (this.jobsService.foiPedidoParar(jobId)) {
                    this.jobsService.finalizar(
                        jobId,
                        'parado',
                        'Interrompido a pedido. As FAQs ja inseridas continuam na base.',
                    );
                    return;
                }

                const bloco = itens.slice(i, i + ImportService.TAMANHO_BLOCO);

                for (const item of bloco) {
                    if (item.estado !== 'ok') {
                        this.jobsService.incrementar(
                            jobId,
                            item.estado === 'duplicada' ? 'puladas' : 'invalidas',
                        );
                        if (item.estado === 'invalida') {
                            this.jobsService.registrarErro(jobId, {
                                linha: item.linha,
                                mensagem: item.motivos.join(' '),
                            });
                        }
                        this.jobsService.avancar(jobId);
                        continue;
                    }

                    try {
                        const resultado = await this.faqsService.createFaq(
                            {
                                question: item.faq.question,
                                answer: item.faq.answer,
                                category: item.faq.category,
                                tags: item.faq.tags,
                                source: item.faq.source,
                            },
                            actor,
                            { ...origemBase, line_reference: item.linha },
                        );

                        this.jobsService.incrementar(jobId, 'inseridas');
                        if (resultado.semEmbedding) {
                            this.jobsService.incrementar(jobId, 'semEmbedding');
                        }
                        this.jobsService.avancar(jobId);

                        // Cota estourada: parar aqui é a decisão importante.
                        // Continuar gravaria centenas de FAQs com vetor vazio —
                        // elas entram na base, aparecem na listagem, e o chatbot
                        // simplesmente nunca as encontra. Ninguém percebe até
                        // alguém estranhar que uma pergunta nunca é respondida.
                        if (resultado.falha === 'cota') {
                            this.jobsService.finalizar(
                                jobId,
                                'cota_esgotada',
                                'A cota da API do Gemini acabou. As FAQs ja inseridas estao na base; ' +
                                'reenvie o mesmo arquivo depois — as que ja entraram serao puladas.',
                            );
                            return;
                        }
                    } catch (erro) {
                        this.jobsService.incrementar(jobId, 'invalidas');
                        this.jobsService.registrarErro(jobId, {
                            linha: item.linha,
                            mensagem: erro instanceof Error ? erro.message : String(erro),
                        });
                        this.jobsService.avancar(jobId);
                    }
                }

                // Devolve a vez ao event loop entre blocos: sem isto, uma
                // importação longa faz o /health e o polling do próprio job
                // ficarem sem resposta.
                await new Promise((r) => setImmediate(r));
            }

            this.jobsService.finalizar(jobId, 'concluido');
        } catch (erro) {
            this.logger.error(
                `Importacao ${jobId} falhou: ${erro instanceof Error ? erro.message : erro}`,
            );
            this.jobsService.finalizar(
                jobId,
                'erro',
                erro instanceof Error ? erro.message : 'Falha inesperada.',
            );
        }
    }
}
