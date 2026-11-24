import { inicioDoDia, intervaloDoDia } from '../comum/fuso';

/**
 * Revisão por data das FAQs.
 *
 * Parte da base vale por um tempo: um surto, uma campanha de vacinação, um
 * horário de férias. A FAQ ganha uma data para alguém conferir se continua
 * valendo. O chatbot continua respondendo com ela depois da data: vencer põe a
 * FAQ na lista de Revisões, não tira do ar, porque tirar deixaria perguntas
 * sem resposta enquanto ninguém revisa.
 */

/** Quantos dias à frente contam como "próximas" na tela de Revisões. */
export const JANELA_PROXIMAS_DIAS = 30;

export type SituacaoRevisao = 'vencida' | 'proxima' | 'futura';
export type FiltroRevisao = 'vencidas' | 'proximas' | 'todas';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Lê a data que chega do formulário ("AAAA-MM-DD") como o início daquele dia
 * em Brasília.
 *
 * `undefined` é "não mexer", e `null` ou texto vazio é "sem revisão". Data que
 * não existe ("2026-02-31") lança Error com a frase para a tela.
 */
export function lerDataDeRevisao(entrada: unknown): Date | null | undefined {
    if (entrada === undefined) return undefined;
    if (entrada === null || entrada === '') return null;
    if (typeof entrada !== 'string') throw new Error('A data de revisão precisa vir como dia, mês e ano.');

    // Aceita também o ISO completo, que é o que a própria API devolve: quem
    // reenvia a FAQ sem mexer na data manda de volta o que recebeu.
    const intervalo = intervaloDoDia(entrada.slice(0, 10));
    if (!intervalo) throw new Error('Essa data de revisão não existe. Confira o dia e o mês.');
    return intervalo.inicio;
}

/**
 * A data nova não pode ter passado: marcar revisão para ontem não pede nada a
 * ninguém. Hoje vale, e a FAQ entra direto nas vencidas.
 */
export function conferirQueNaoPassou(data: Date, agora: Date): void {
    if (data.getTime() < inicioDoDia(agora).getTime()) {
        throw new Error('Essa data de revisão já passou. Escolha hoje ou um dia à frente.');
    }
}

/** Vencida a partir do próprio dia; próxima nos 30 dias seguintes. */
export function situacaoDaRevisao(revisarEm: Date, agora: Date): SituacaoRevisao {
    if (revisarEm.getTime() <= agora.getTime()) return 'vencida';
    if (revisarEm.getTime() <= agora.getTime() + JANELA_PROXIMAS_DIAS * DIA_MS) return 'proxima';
    return 'futura';
}

/** O pedaço do filtro do Mongo para cada aba da tela de Revisões. */
export function filtroDaRevisao(filtro: FiltroRevisao, agora: Date): Record<string, unknown> {
    const limiteProximas = new Date(agora.getTime() + JANELA_PROXIMAS_DIAS * DIA_MS);
    switch (filtro) {
        case 'vencidas':
            return { revisar_em: { $lte: agora } };
        case 'proximas':
            return { revisar_em: { $gt: agora, $lte: limiteProximas } };
        default:
            // $type e não $ne: null: FAQ antiga nem tem o campo, e a intenção
            // fica escrita.
            return { revisar_em: { $type: 'date' } };
    }
}

/** "AAAA-MM-DD" no fuso da equipe, para o Histórico ler a data como dia. */
export function dataComoDia(data: Date | null | undefined): string {
    if (!data) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(data);
}
