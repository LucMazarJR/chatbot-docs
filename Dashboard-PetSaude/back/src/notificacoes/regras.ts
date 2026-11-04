import { randomUUID } from 'node:crypto';

import type { Entrega, Notificacao, TipoDaEquipe } from './tipos';

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

export const DETALHE_MAXIMO = 1000;

/** Folga entre o relógio de quem preencheu o formulário e o do servidor. */
const TOLERANCIA_MS = 5 * MINUTO;

/**
 * Tempo mínimo de validade depois do envio.
 *
 * O despachante roda a cada 30 segundos e a primeira retentativa espera 1
 * minuto: um aviso que vale por menos que isso expira antes de ter chance.
 */
export const VALIDADE_MINIMA_MS = 15 * MINUTO;

/** O serviço de push não guarda um aviso por mais de 4 semanas. */
export const VALIDADE_MAXIMA_MS = 28 * DIA;

export const ANTECEDENCIA_MAXIMA_MS = 90 * DIA;

/**
 * O que há de errado com o horário escolhido, ou null.
 *
 * LÓGICA DO LUCIANO: a validade é o que impede um lembrete de chegar depois do
 * compromisso. Se o PC que roda o despachante ficar desligado, o aviso vencido
 * é descartado em vez de sair atrasado, então quem agenda precisa dizer até
 * quando ele ainda faz sentido, e essa janela tem que ser possível de cumprir.
 */
export function problemaNaJanela(enviarEm: Date, validaAte: Date, agora: Date): string | null {
    if (Number.isNaN(enviarEm.getTime()) || Number.isNaN(validaAte.getTime())) {
        return 'Data inválida.';
    }
    if (enviarEm.getTime() < agora.getTime() - TOLERANCIA_MS) {
        return 'O horário de envio já passou.';
    }
    if (enviarEm.getTime() > agora.getTime() + ANTECEDENCIA_MAXIMA_MS) {
        return 'Dá para agendar com até 90 dias de antecedência.';
    }
    const inicio = Math.max(enviarEm.getTime(), agora.getTime());
    if (validaAte.getTime() - inicio < VALIDADE_MINIMA_MS) {
        return 'O aviso precisa valer por pelo menos 15 minutos depois do envio, para dar tempo de chegar.';
    }
    if (validaAte.getTime() - enviarEm.getTime() > VALIDADE_MAXIMA_MS) {
        return 'Um aviso vale por no máximo 4 semanas depois do envio: o serviço de push não guarda por mais tempo.';
    }
    return null;
}

export type DadosDoLote = {
    loteId: string;
    usuarioIds: string[];
    tipo: TipoDaEquipe;
    detalhe: string;
    mostrarDetalhe: boolean;
    enviarEm: Date;
    validaAte: Date;
    criadaPor: string;
    agora: Date;
};

/** Um documento pendente por pessoa, no formato exato que o despachante espera. */
export function montarAvisos(dados: DadosDoLote, gerarId: () => string = randomUUID): Notificacao[] {
    return dados.usuarioIds.map((usuarioId) => ({
        _id: gerarId(),
        loteId: dados.loteId,
        usuarioId,
        tipo: dados.tipo,
        detalhe: dados.detalhe,
        mostrarDetalhe: dados.mostrarDetalhe,
        enviarEm: dados.enviarEm,
        validaAte: dados.validaAte,
        estado: 'pendente',
        tentativas: 0,
        travadaAte: null,
        recibo: null,
        entregas: [],
        motivo: null,
        criadaEm: dados.agora,
        criadaPor: dados.criadaPor,
        enviadaEm: null,
        exibidaEm: null,
        abertaEm: null,
        expiraEm: null,
    }));
}

/**
 * Sistema e navegador, a partir do user agent do aparelho inscrito.
 *
 * É o recorte que a validação precisa: o push na web se comporta diferente em
 * cada combinação, e a pergunta é "chegou no iPhone instalado na tela de
 * início?", não "chegou?".
 *
 * Limite conhecido: o iPad se anuncia como Mac desde o iPadOS 13, então aparece
 * como Mac.
 */
export function plataformaDe(userAgent: string): string {
    const ua = userAgent ?? '';

    const sistema = /Android/i.test(ua)
        ? 'Android'
        : /iPhone|iPad|iPod/i.test(ua)
          ? 'iOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Macintosh|Mac OS X/i.test(ua)
                ? 'Mac'
                : /Linux/i.test(ua)
                  ? 'Linux'
                  : 'Outro sistema';

    // No iOS, o push só existe no app adicionado à tela de início, e esse app
    // não traz o "Safari/" no user agent. É o caso que mais importa separar.
    if (sistema === 'iOS' && !/Safari\//.test(ua)) return 'iOS · app na tela de início';

    const navegador = /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Edg(A|iOS)?\//.test(ua)
          ? 'Edge'
          : /OPR\/|Opera/.test(ua)
            ? 'Opera'
            : /Firefox\/|FxiOS/.test(ua)
              ? 'Firefox'
              : /Chrome\/|CriOS/.test(ua)
                ? 'Chrome'
                : /Safari\//.test(ua)
                  ? 'Safari'
                  : 'outro navegador';

    return `${sistema} · ${navegador}`;
}

export type ResumoDePlataforma = {
    plataforma: string;
    /** Aparelhos para os quais o aviso foi tentado. */
    aparelhos: number;
    /** O serviço de push aceitou. Não quer dizer que apareceu. */
    aceitas: number;
    /** O service worker confirmou que mostrou na tela. */
    exibidas: number;
    abertas: number;
    /** O aparelho desinstalou, limpou os dados ou revogou a permissão. */
    inscricoesMortas: number;
    falhas: number;
};

/**
 * Taxas por plataforma, contando cada aparelho uma vez por aviso.
 *
 * O despachante acrescenta uma entrega por tentativa, e o recibo marca todas as
 * entregas daquele aparelho. Somar as entregas cruas contaria duas vezes o
 * aparelho de um aviso que precisou de retentativa.
 */
export function resumirPorPlataforma(avisos: Pick<Notificacao, 'entregas'>[]): ResumoDePlataforma[] {
    const porPlataforma = new Map<string, ResumoDePlataforma>();

    for (const aviso of avisos) {
        const ultimaPorAparelho = new Map<string, Entrega & { exibida: boolean; aberta: boolean }>();
        for (const entrega of aviso.entregas ?? []) {
            const anterior = ultimaPorAparelho.get(entrega.inscricaoId);
            const exibida = Boolean(entrega.exibidaEm) || Boolean(anterior?.exibida);
            const aberta = Boolean(entrega.abertaEm) || Boolean(anterior?.aberta);
            const maisRecente =
                !anterior || new Date(entrega.em).getTime() >= new Date(anterior.em).getTime()
                    ? entrega
                    : anterior;
            ultimaPorAparelho.set(entrega.inscricaoId, { ...maisRecente, exibida, aberta });
        }

        for (const entrega of ultimaPorAparelho.values()) {
            const plataforma = plataformaDe(entrega.userAgent);
            const resumo = porPlataforma.get(plataforma) ?? {
                plataforma,
                aparelhos: 0,
                aceitas: 0,
                exibidas: 0,
                abertas: 0,
                inscricoesMortas: 0,
                falhas: 0,
            };
            resumo.aparelhos += 1;
            if (entrega.resultado === 'enviada') resumo.aceitas += 1;
            if (entrega.resultado === 'inscricao-morta') resumo.inscricoesMortas += 1;
            if (entrega.resultado === 'falhou' || entrega.resultado === 'tentar-de-novo') resumo.falhas += 1;
            if (entrega.exibida) resumo.exibidas += 1;
            if (entrega.aberta) resumo.abertas += 1;
            porPlataforma.set(plataforma, resumo);
        }
    }

    return [...porPlataforma.values()].sort((a, b) => b.aparelhos - a.aparelhos);
}
