import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type EstadoJob = 'rodando' | 'concluido' | 'parado' | 'cota_esgotada' | 'erro';

export type ErroDeLinha = { linha: number; mensagem: string };

export type Job = {
    id: string;
    tipo: string;
    estado: EstadoJob;
    /** Quantos itens o job tem para processar. */
    total: number;
    processados: number;
    /** Contadores próprios de cada tipo de job — inseridas, puladas, etc. */
    contadores: Record<string, number>;
    erros: ErroDeLinha[];
    /** Quantos erros aconteceram além dos que couberam em `erros`. */
    errosOmitidos: number;
    mensagem?: string;
    iniciadoEm: Date;
    terminadoEm?: Date;
    /** Quem pediu, para o log e para a tela dizer "iniciado por". */
    atorNome: string;
};

/**
 * Trabalhos longos que a tela acompanha por polling.
 *
 * LÓGICA DO LUCIANO: o registro é em memória, e isso é uma escolha, não um
 * atalho. Gravar o andamento no banco daria durabilidade a um estado que não
 * precisa dela: os dois jobs que existem — importar um lote e gerar embeddings
 * faltantes — derivam o que falta do próprio banco a cada execução. Se a API
 * reiniciar no meio, o job some, mas as FAQs que já entraram estão lá e rodar
 * de novo retoma de onde parou, porque o alvo é recalculado. O preço é a tela
 * precisar dizer que o trabalho parou, e ela diz.
 *
 * Um job por tipo de cada vez. Dois backfills simultâneos gastariam a cota da
 * API do Gemini em dobro no mesmo conteúdo; duas importações do mesmo arquivo
 * competiriam pela mesma verificação de duplicata e as duas achariam que a
 * linha é nova.
 */
@Injectable()
export class JobsService {
    private readonly logger = new Logger(JobsService.name);

    private readonly jobs = new Map<string, Job>();
    private readonly parada = new Set<string>();

    /** Erros guardados por job. Além disso, só a contagem. */
    private static readonly TETO_ERROS = 200;

    /** Job terminado some da memória depois disso. */
    private static readonly TTL_MS = 60 * 60 * 1000;

    criar(tipo: string, total: number, atorNome: string): Job {
        const rodando = this.doTipo(tipo);
        if (rodando) {
            throw new ConflictException(
                `Ja existe um trabalho de "${tipo}" em andamento, iniciado por ${rodando.atorNome}.`,
            );
        }

        this.limparAntigos();

        const job: Job = {
            id: randomUUID(),
            tipo,
            estado: 'rodando',
            total,
            processados: 0,
            contadores: {},
            erros: [],
            errosOmitidos: 0,
            iniciadoEm: new Date(),
            atorNome,
        };
        this.jobs.set(job.id, job);
        this.logger.log(`Job ${tipo} ${job.id} iniciado por ${atorNome} (${total} itens).`);
        return job;
    }

    /** O job em andamento de um tipo, se houver. */
    doTipo(tipo: string): Job | undefined {
        for (const job of this.jobs.values()) {
            if (job.tipo === tipo && job.estado === 'rodando') return job;
        }
        return undefined;
    }

    buscar(id: string): Job {
        const job = this.jobs.get(id);
        if (!job) {
            // Depois do TTL o job some. Dizer isso é melhor que um 404 seco: a
            // tela reaberta uma hora depois precisa distinguir "nunca existiu"
            // de "terminou faz tempo".
            throw new NotFoundException(
                'Trabalho nao encontrado. Ele pode ter terminado ha mais de uma hora, ou a API foi reiniciada.',
            );
        }
        return job;
    }

    incrementar(id: string, chave: string, quanto = 1): void {
        const job = this.jobs.get(id);
        if (!job) return;
        job.contadores[chave] = (job.contadores[chave] ?? 0) + quanto;
    }

    avancar(id: string, quanto = 1): void {
        const job = this.jobs.get(id);
        if (!job) return;
        job.processados += quanto;
    }

    registrarErro(id: string, erro: ErroDeLinha): void {
        const job = this.jobs.get(id);
        if (!job) return;
        if (job.erros.length < JobsService.TETO_ERROS) job.erros.push(erro);
        else job.errosOmitidos++;
    }

    /** Pedido de parada. O laço do worker confere entre um bloco e outro. */
    solicitarParada(id: string): Job {
        const job = this.buscar(id);
        if (job.estado === 'rodando') this.parada.add(id);
        return job;
    }

    foiPedidoParar(id: string): boolean {
        return this.parada.has(id);
    }

    finalizar(id: string, estado: EstadoJob, mensagem?: string): void {
        const job = this.jobs.get(id);
        if (!job) return;
        job.estado = estado;
        job.mensagem = mensagem;
        job.terminadoEm = new Date();
        this.parada.delete(id);
        this.logger.log(
            `Job ${job.tipo} ${id} terminou como "${estado}" ` +
            `(${job.processados}/${job.total}).${mensagem ? ' ' + mensagem : ''}`,
        );
    }

    private limparAntigos(): void {
        const limite = Date.now() - JobsService.TTL_MS;
        for (const [id, job] of this.jobs) {
            if (job.terminadoEm && job.terminadoEm.getTime() < limite) {
                this.jobs.delete(id);
                this.parada.delete(id);
            }
        }
    }
}
