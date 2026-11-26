import type { Model } from 'mongoose';

import { inicioDoDia, intervaloDoDia } from '../comum/fuso';
import type { Periodo } from './conversas.service';

export type Intervalo = { $gte: Date; $lt?: Date };

/**
 * Condição de data do período, ou null quando o filtro é "tudo".
 *
 * "dia" é um dia do calendário, escolhido na tela para rever um teste
 * presencial. Data inválida vale como "tudo", como os outros filtros.
 */
export function intervaloDoPeriodo(periodo: Periodo, dia?: string): Intervalo | null {
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

/**
 * Sessões que tiveram algo no período: começaram nele ou receberam mensagem nele.
 *
 * LÓGICA DO LUCIANO: o chat anônimo guarda a sessão no aparelho e a retoma em
 * qualquer dia, até a pessoa avaliar. Quem abriu o link num dia e só perguntou
 * dias depois tem a conversa numa sessão de `iniciadaEm` antigo. Filtrando só
 * por `iniciadaEm`, essa conversa sumia de "Hoje" e ficava enterrada na data da
 * primeira visita, e parecia que o chat não tinha gravado nada.
 *
 * Devolve a condição para o `$match` das sessões, ou null quando é "tudo".
 */
export async function filtroDeAtividade(
    mensagemModel: Model<any>,
    intervalo: Intervalo | null,
): Promise<Record<string, unknown> | null> {
    if (!intervalo) return null;
    const comMensagem: string[] = await mensagemModel.distinct('sessaoId', { em: intervalo }).exec();
    return { $or: [{ iniciadaEm: intervalo }, { _id: { $in: comMensagem } }] };
}
