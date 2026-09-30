import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { inicioDoDia } from '../comum/fuso';
import { JobsService } from '../jobs/jobs.service';
import { deveRodarSozinha, pausaDepoisDe } from './automatica';
import { CuradoriaService, JOB_CURADORIA } from './curadoria.service';

/** De quanto em quanto tempo a fila é conferida. */
const INTERVALO_MS = 5 * 60 * 1000;

/**
 * Espera antes da primeira conferência: a conexão com o banco termina de subir
 * depois do bootstrap, e contar a fila antes disso falharia à toa.
 */
const ATRASO_INICIAL_MS = 30 * 1000;

/** Quem aparece como autor das rodadas automáticas no histórico. */
export const ATOR_AUTOMATICO = { name: 'Análise automática' } as const;

/**
 * Roda a análise das perguntas sem resposta sozinha, a cada rodada cheia.
 *
 * LÓGICA DO LUCIANO: confere a fila no boot, a cada 5 minutos e sempre que
 * alguém abre a contagem no painel. O último gatilho existe por causa do plano
 * gratuito do Render: sem visita, o serviço dorme, o relógio para junto, e é a
 * visita que o acorda. Com o serviço acordado, a análise sai sem ninguém lembrar.
 *
 * `CURADORIA_AUTOMATICA=0` desliga. Vazia ou ausente, fica ligada.
 */
@Injectable()
export class CuradoriaAutomaticaService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(CuradoriaAutomaticaService.name);
    private relogio: ReturnType<typeof setInterval> | null = null;
    private primeira: ReturnType<typeof setTimeout> | null = null;
    private conferindo = false;
    private pausadaAte = 0;
    /** A última rodada que esta classe iniciou, para saber como ela terminou. */
    private ultimoJobId: string | null = null;
    private readonly ligada: boolean;

    constructor(
        private readonly curadoria: CuradoriaService,
        private readonly jobs: JobsService,
        config: ConfigService,
    ) {
        this.ligada = (config.get<string>('CURADORIA_AUTOMATICA') ?? '').trim() !== '0';
    }

    onApplicationBootstrap(): void {
        if (!this.ligada) {
            this.logger.log('Analise automatica da curadoria desligada (CURADORIA_AUTOMATICA=0).');
            return;
        }
        this.primeira = setTimeout(() => void this.conferir(), ATRASO_INICIAL_MS);
        this.relogio = setInterval(() => void this.conferir(), INTERVALO_MS);
    }

    onModuleDestroy(): void {
        if (this.primeira) clearTimeout(this.primeira);
        if (this.relogio) clearInterval(this.relogio);
    }

    /**
     * Confere a fila e, se juntou uma rodada, começa a análise.
     *
     * Nunca lança: é chamada por relógio e de dentro de uma consulta do painel,
     * e nenhum dos dois pode quebrar por causa dela.
     */
    async conferir(): Promise<void> {
        if (!this.ligada || this.conferindo) return;
        this.conferindo = true;
        try {
            this.atualizarPausa();
            const { pendentes, tamanhoDaRodada } = await this.curadoria.contarPendentes();
            const rodar = deveRodarSozinha({
                pendentes,
                tamanhoDaRodada,
                rodando: Boolean(this.jobs.doTipo(JOB_CURADORIA)),
                pausadaAte: this.pausadaAte,
                agora: Date.now(),
            });
            if (!rodar) return;

            const { jobId } = this.curadoria.iniciarRodada(ATOR_AUTOMATICO);
            this.ultimoJobId = jobId;
            this.logger.log(`Analise automatica iniciada com ${pendentes} perguntas na fila.`);
        } catch (erro) {
            this.logger.error(
                `Analise automatica nao conferiu a fila: ${erro instanceof Error ? erro.message : erro}`,
            );
        } finally {
            this.conferindo = false;
        }
    }

    /** Lê como terminou a última rodada automática e pausa se foi mal. */
    private atualizarPausa(): void {
        if (!this.ultimoJobId) return;
        let estado: string;
        try {
            estado = this.jobs.buscar(this.ultimoJobId).estado;
        } catch {
            // O registro do trabalho some depois de uma hora: sem ele, não há
            // o que ler, e a próxima rodada decide sozinha.
            this.ultimoJobId = null;
            return;
        }
        if (estado === 'rodando') return;

        const agora = Date.now();
        const diaSeguinte = (d: Date) => inicioDoDia(new Date(d.getTime() + 24 * 60 * 60 * 1000));
        const pausa = pausaDepoisDe(estado, agora, diaSeguinte);
        if (pausa > 0) {
            this.pausadaAte = pausa;
            this.logger.warn(
                `Analise automatica pausada ate ${new Date(pausa).toISOString()}: a ultima rodada terminou como "${estado}".`,
            );
        }
        this.ultimoJobId = null;
    }
}
