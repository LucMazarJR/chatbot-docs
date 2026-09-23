/** O fuso de quem usa o sistema: o projeto atende um município brasileiro. */
export const FUSO = 'America/Sao_Paulo';

/**
 * O instante em que começou o dia de `agora`, no fuso da equipe.
 *
 * LÓGICA DO LUCIANO: o servidor roda em UTC. Com `setHours(0, 0, 0, 0)`, "hoje"
 * começava à meia-noite de Greenwich, que é 21h do dia anterior em Brasília: o
 * filtro de Conversas mostrava como de hoje as conversas da noite de ontem.
 *
 * O deslocamento é calculado para o próprio instante, e não fixado em -3h: se o
 * país voltar a ter horário de verão, a conta continua certa sem mudar código.
 */
export function inicioDoDia(agora: Date, fuso: string = FUSO): Date {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: fuso,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(agora);
    const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);

    const ano = valor('year');
    const mes = valor('month') - 1;
    const dia = valor('day');
    const comoSeFosseUtc = Date.UTC(ano, mes, dia, valor('hour'), valor('minute'), valor('second'));
    const deslocamento = comoSeFosseUtc - Math.floor(agora.getTime() / 1000) * 1000;

    return new Date(Date.UTC(ano, mes, dia) - deslocamento);
}
