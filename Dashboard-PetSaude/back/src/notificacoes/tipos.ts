/**
 * Espelho do contrato da fila de avisos.
 *
 * O dono do formato é o PWA (pwa/src/lib/notificacoes/tipos.ts): este painel só
 * ESCREVE avisos pendentes na coleção `notificacoes` e lê o que o despachante de
 * lá gravou depois. Mudar um campo lá exige mudar aqui na mesma alteração: o
 * contrato está descrito em docs/notificacoes-push.md.
 */

export const TIPOS_DE_NOTIFICACAO = [
    'lembrete-exame',
    'lembrete-consulta',
    'aviso',
    'teste',
] as const;

export type TipoNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number];

/** O que a equipe envia. `teste` é o botão da própria pessoa, dentro do PWA. */
export const TIPOS_DA_EQUIPE = ['lembrete-exame', 'lembrete-consulta', 'aviso'] as const;

export type TipoDaEquipe = (typeof TIPOS_DA_EQUIPE)[number];

export const ROTULO_DO_TIPO: Record<TipoNotificacao, string> = {
    'lembrete-exame': 'Lembrete de exame',
    'lembrete-consulta': 'Lembrete de consulta',
    aviso: 'Aviso da equipe',
    teste: 'Teste',
};

export const ESTADOS = ['pendente', 'enviando', 'enviada', 'expirada', 'falhou', 'cancelada'] as const;

export type EstadoNotificacao = (typeof ESTADOS)[number];

export type ResultadoEntrega = 'enviada' | 'inscricao-morta' | 'tentar-de-novo' | 'falhou';

/** O que aconteceu com o aviso em UM aparelho. */
export type Entrega = {
    inscricaoId: string;
    resultado: ResultadoEntrega;
    codigo: number | null;
    em: Date;
    userAgent: string;
    exibidaEm: Date | null;
    abertaEm: Date | null;
};

/** O documento da fila, campo a campo como o PWA grava. */
export type Notificacao = {
    _id: string;
    loteId: string | null;
    usuarioId: string;
    tipo: TipoNotificacao;
    detalhe: string;
    mostrarDetalhe: boolean;
    enviarEm: Date;
    validaAte: Date;
    estado: EstadoNotificacao;
    tentativas: number;
    travadaAte: Date | null;
    recibo: string | null;
    entregas: Entrega[];
    motivo: string | null;
    criadaEm: Date;
    criadaPor: string;
    enviadaEm: Date | null;
    exibidaEm: Date | null;
    abertaEm: Date | null;
    expiraEm: Date | null;
};

/** O mesmo `GUARDAR_DEPOIS_DE_SAIR_MS` do despachante: 90 dias depois de sair da fila. */
export const GUARDAR_DEPOIS_DE_SAIR_MS = 90 * 24 * 60 * 60 * 1000;
