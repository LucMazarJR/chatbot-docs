import { inicioDoDia, intervaloDoDia } from '../comum/fuso';
import type { Periodo } from './conversas.service';

/**
 * Condição sobre `iniciadaEm`, ou null quando o filtro é "tudo".
 *
 * "dia" é um dia do calendário, escolhido na tela para rever um teste
 * presencial. Data inválida vale como "tudo", como os outros filtros.
 */
export function intervaloDoPeriodo(periodo: Periodo, dia?: string): { $gte: Date; $lt?: Date } | null {
    const agora = new Date();

    // No fuso da equipe: o servidor roda em UTC (ver comum/fuso.ts).
    if (periodo === 'hoje') return { $gte: inicioDoDia(agora) };
    if (periodo === '7d') return { $gte: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000) };
    if (periodo === '30d') return { $gte: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000) };
    if (periodo === 'dia' && dia) {
        const doDia = intervaloDoDia(dia);
        if (doDia) return { $gte: doDia.inicio, $lt: doDia.fim };
    }
    return null;
}
