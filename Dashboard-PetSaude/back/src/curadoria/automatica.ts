/**
 * Quando a análise das perguntas sem resposta roda sozinha.
 *
 * LÓGICA DO LUCIANO: a curadoria nasceu com um botão, e o pedido era outro: a
 * cada 10 perguntas acumuladas, analisar sem ninguém lembrar. O botão continua
 * como opção, para quem quer analisar antes de juntar 10.
 *
 * A decisão fica aqui, separada do relógio, para ser testada sozinha.
 */

/** Depois de um erro, espera isto antes de tentar de novo. */
export const ESPERA_DEPOIS_DE_ERRO_MS = 30 * 60 * 1000;

export type SituacaoDaFila = {
    pendentes: number;
    tamanhoDaRodada: number;
    /** Já há uma análise rodando, manual ou automática. */
    rodando: boolean;
    /** Pausa depois de cota esgotada ou erro, em milissegundos desde 1970. */
    pausadaAte: number;
    agora: number;
};

export function deveRodarSozinha(fila: SituacaoDaFila): boolean {
    if (fila.rodando) return false;
    if (fila.agora < fila.pausadaAte) return false;
    return fila.pendentes >= fila.tamanhoDaRodada;
}

/**
 * Até quando pausar depois de uma rodada que não terminou bem.
 *
 * Cota esgotada só volta no dia seguinte: tentar a cada 5 minutos até lá seria
 * bater na recusa o dia inteiro. Erro comum espera meia hora, para um modelo
 * fora do ar não virar uma tentativa por relógio. Rodada que terminou bem não
 * pausa nada.
 */
export function pausaDepoisDe(
    estado: string,
    agora: number,
    inicioDoDiaSeguinte: (agora: Date) => Date,
): number {
    if (estado === 'cota_esgotada') return inicioDoDiaSeguinte(new Date(agora)).getTime();
    if (estado === 'erro' || estado === 'parado') return agora + ESPERA_DEPOIS_DE_ERRO_MS;
    return 0;
}
