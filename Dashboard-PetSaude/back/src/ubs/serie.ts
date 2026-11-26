import { FUSO } from '../comum/fuso';

export type Granularidade = 'hora' | 'dia' | 'semana';

/** Uma pergunta: de qual conversa e quando. É o que a série conta. */
export type PerguntaNoTempo = { sessaoId: string; em: Date };

export type Serie = {
    granularidade: Granularidade;
    /** O começo de cada intervalo, como texto no fuso da equipe: "2026-11-26" ou "2026-11-26T14". */
    intervalos: string[];
    /** Conversas com pergunta em cada intervalo, todas as unidades juntas. */
    total: number[];
    /** O mesmo, por unidade, na ordem de `intervalos`. Só as unidades com alguma conversa. */
    porUnidade: Record<string, number[]>;
};

/**
 * A granularidade que cabe no período: um ponto por hora num dia, por dia numa
 * semana ou mês, por semana no histórico inteiro. Com um ponto por dia em
 * "Tudo", meses de teste virariam centenas de pontos ilegíveis no celular.
 */
export function granularidadeDo(periodo: string): Granularidade {
    if (periodo === 'hoje' || periodo === 'dia') return 'hora';
    if (periodo === 'tudo') return 'semana';
    return 'dia';
}

const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
});

function partes(instante: Date) {
    const p = Object.fromEntries(formatador.formatToParts(instante).map((x) => [x.type, x.value]));
    return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour) };
}

const dois = (n: number) => String(n).padStart(2, '0');
const dataTexto = (ano: number, mes: number, dia: number) => `${ano}-${dois(mes)}-${dois(dia)}`;

/**
 * Em qual intervalo cai um instante, no fuso da equipe.
 *
 * A semana começa na segunda. A conta do dia da semana é feita sobre a data
 * do calendário (meio-dia UTC), e não sobre o instante, para a virada do dia
 * em Brasília não jogar uma pergunta das 22h na semana errada.
 */
export function intervaloDe(instante: Date, granularidade: Granularidade): string {
    const { ano, mes, dia, hora } = partes(instante);
    if (granularidade === 'hora') return `${dataTexto(ano, mes, dia)}T${dois(hora)}`;
    if (granularidade === 'dia') return dataTexto(ano, mes, dia);
    const meioDia = new Date(Date.UTC(ano, mes - 1, dia, 12));
    const desdeSegunda = (meioDia.getUTCDay() + 6) % 7;
    meioDia.setUTCDate(meioDia.getUTCDate() - desdeSegunda);
    return dataTexto(meioDia.getUTCFullYear(), meioDia.getUTCMonth() + 1, meioDia.getUTCDate());
}

/** O intervalo seguinte, em texto. Trabalha sobre o calendário, sem fuso. */
function proximo(intervalo: string, granularidade: Granularidade): string {
    if (granularidade === 'hora') {
        const [data, h] = intervalo.split('T');
        const hora = Number(h) + 1;
        if (hora < 24) return `${data}T${dois(hora)}`;
        return `${proximo(data, 'dia')}T00`;
    }
    const [ano, mes, dia] = intervalo.split('-').map(Number);
    const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
    d.setUTCDate(d.getUTCDate() + (granularidade === 'semana' ? 7 : 1));
    return dataTexto(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Conversas por intervalo, no total e por unidade.
 *
 * Conta conversas, e não perguntas: uma pessoa que fez dez perguntas numa
 * manhã é uma conversa naquela manhã, como no resto da tela. Os intervalos
 * sem nenhuma conversa entram com zero, do começo ao fim: pular os vazios
 * desenharia uma linha reta por cima dos dias parados.
 *
 * @param unidadeDaSessao a unidade reconhecida de cada conversa, ou null.
 */
export function montarSerie(
    perguntas: PerguntaNoTempo[],
    unidadeDaSessao: (sessaoId: string) => string | null,
    granularidade: Granularidade,
    inicio: Date | null,
    fim: Date,
): Serie {
    if (perguntas.length === 0 && !inicio) {
        return { granularidade, intervalos: [], total: [], porUnidade: {} };
    }
    const primeira = inicio ?? perguntas.reduce((menor, p) => (p.em < menor ? p.em : menor), perguntas[0].em);

    const intervalos: string[] = [];
    const ultimo = intervaloDe(fim, granularidade);
    // O teto protege de um período absurdo virar um laço sem fim.
    for (let atual = intervaloDe(primeira, granularidade); intervalos.length < 2000; atual = proximo(atual, granularidade)) {
        intervalos.push(atual);
        if (atual >= ultimo) break;
    }
    const posicao = new Map(intervalos.map((intervalo, i) => [intervalo, i]));

    // Uma conversa conta uma vez por intervalo, por mais perguntas que tenha nele.
    const vistas = new Set<string>();
    const total = intervalos.map(() => 0);
    const porUnidade: Record<string, number[]> = {};

    for (const { sessaoId, em } of perguntas) {
        const intervalo = intervaloDe(em, granularidade);
        const i = posicao.get(intervalo);
        if (i === undefined || vistas.has(`${sessaoId}|${intervalo}`)) continue;
        vistas.add(`${sessaoId}|${intervalo}`);
        total[i]++;
        const unidade = unidadeDaSessao(sessaoId);
        if (unidade) (porUnidade[unidade] ??= intervalos.map(() => 0))[i]++;
    }

    return { granularidade, intervalos, total, porUnidade };
}
