/**
 * A fila de avisos e os tipos de aviso.
 *
 * LÓGICA DO LUCIANO: quem cria avisos (o dashboard, ou uma integração com a
 * agenda) só escreve documentos nesta fila; quem envia é um só, o
 * despachante do PWA. Um produtor novo não toca no envio, e o envio não precisa
 * saber de onde o aviso veio.
 *
 * O dashboard grava nesta coleção — este arquivo é o dono do formato, e o
 * espelho de lá precisa acompanhar (ver docs/notificacoes-push.md).
 */

export const TIPOS_DE_NOTIFICACAO = ['lembrete-exame', 'lembrete-consulta', 'aviso', 'teste'] as const;

export type TipoNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number];

export type EstadoNotificacao =
  | 'pendente'
  | 'enviando'
  | 'enviada'
  /** Passou de `validaAte` sem sair. Não é enviada atrasada. */
  | 'expirada'
  | 'falhou'
  | 'cancelada';

export type ResultadoEntrega = 'enviada' | 'inscricao-morta' | 'tentar-de-novo' | 'falhou';

/** O que aconteceu com o aviso em UM aparelho. */
export type Entrega = {
  inscricaoId: string;
  resultado: ResultadoEntrega;
  codigo: number | null;
  em: Date;
  /** Do navegador inscrito — é o que permite medir os limites por plataforma. */
  userAgent: string;
  /**
   * O push chegou a este aparelho. Opcional porque avisos gravados antes do
   * recibo de chegada não têm o campo.
   */
  recebidaEm?: Date | null;
  exibidaEm: Date | null;
  abertaEm: Date | null;
};

export type Notificacao = {
  /** UUID em string, como o resto do PWA. */
  _id: string;
  /** Agrupa os avisos de um mesmo envio do dashboard. Nulo nos testes. */
  loteId: string | null;
  usuarioId: string;
  tipo: TipoNotificacao;
  /** O texto completo. Aparece dentro do app, com a conta logada. */
  detalhe: string;
  /** Deixar o detalhe aparecer também na tela bloqueada. Falso por padrão. */
  mostrarDetalhe: boolean;
  enviarEm: Date;
  /** Depois disto o aviso não faz mais sentido e é descartado, não enviado. */
  validaAte: Date;
  estado: EstadoNotificacao;
  tentativas: number;
  /** Reivindicação em andamento; vencida, outra rodada pode pegar de novo. */
  travadaAte: Date | null;
  /** Segredo que o service worker devolve nos recibos, gerado no envio. */
  recibo: string | null;
  entregas: Entrega[];
  motivo: string | null;
  criadaEm: Date;
  criadaPor: string;
  enviadaEm: Date | null;
  /**
   * Primeira vez que o push chegou a algum aparelho, antes de ele tentar mostrar.
   *
   * Separado de `exibidaEm` porque são falhas diferentes: não chegou é entrega
   * (bateria, rede, serviço de push); chegou e não apareceu é o celular
   * bloqueando notificação. Opcional porque o painel grava avisos sem ele.
   */
  recebidaEm?: Date | null;
  /** Primeira vez que algum aparelho mostrou o aviso. */
  exibidaEm: Date | null;
  /** Primeira vez que alguém tocou nele. */
  abertaEm: Date | null;
  /** TTL: preenchido quando o aviso sai da fila, para a coleção não crescer para sempre. */
  expiraEm: Date | null;
};

type DefinicaoDeTipo = {
  rotulo: string;
  /** O que aparece na tela bloqueada quando o detalhe não pode aparecer. */
  titulo: string;
  corpo: string;
  urgencia: 'normal' | 'high';
};

/**
 * Texto e urgência de cada tipo — o único lugar para mantê-los.
 *
 * LÓGICA DO LUCIANO: o título NUNCA diz do que é o lembrete. A notificação
 * aparece na tela bloqueada, e o celular fica em cima da mesa do trabalho, na
 * mão do filho, no painel do carro. "Exame de HIV amanhã" ali é vazamento de
 * dado de saúde, e até "lembrete de exame" diz mais do que precisa. O detalhe só
 * aparece dentro do app, com a conta logada — a não ser que quem criou o aviso
 * tenha marcado `mostrarDetalhe`.
 */
export const TIPOS: Record<TipoNotificacao, DefinicaoDeTipo> = {
  'lembrete-exame': {
    rotulo: 'Lembrete de exame',
    titulo: 'Você tem um lembrete',
    corpo: 'Toque para ver os detalhes.',
    urgencia: 'high',
  },
  'lembrete-consulta': {
    rotulo: 'Lembrete de consulta',
    titulo: 'Você tem um lembrete',
    corpo: 'Toque para ver os detalhes.',
    urgencia: 'high',
  },
  aviso: {
    rotulo: 'Aviso da equipe',
    titulo: 'Novo aviso da equipe de saúde',
    corpo: 'Toque para ler.',
    urgencia: 'normal',
  },
  teste: {
    rotulo: 'Teste',
    titulo: 'Notificação de teste',
    corpo: 'Se você está vendo isto, os avisos funcionam neste aparelho.',
    urgencia: 'normal',
  },
};

export function tipoValido(tipo: unknown): tipo is TipoNotificacao {
  return typeof tipo === 'string' && (TIPOS_DE_NOTIFICACAO as readonly string[]).includes(tipo);
}

/** O que vai dentro do push. Pequeno de propósito: o protocolo aceita ~4 KB. */
export type ConteudoPush = {
  id: string;
  recibo: string;
  titulo: string;
  corpo: string;
  url: string;
  tag: string;
};

const CORPO_MAXIMO = 180;

export function montarConteudo(
  notificacao: Pick<Notificacao, '_id' | 'tipo' | 'detalhe' | 'mostrarDetalhe'>,
  recibo: string,
): ConteudoPush {
  const tipo = TIPOS[notificacao.tipo] ?? TIPOS.aviso;
  const detalhe = notificacao.detalhe.trim();

  const corpo =
    notificacao.mostrarDetalhe && detalhe
      ? detalhe.length > CORPO_MAXIMO
        ? `${detalhe.slice(0, CORPO_MAXIMO - 1)}…`
        : detalhe
      : tipo.corpo;

  return {
    id: notificacao._id,
    recibo,
    titulo: tipo.titulo,
    corpo,
    url: `/staging/avisos/${notificacao._id}`,
    // A mesma tag substitui a notificação em vez de empilhar: uma retentativa
    // que chega duas vezes não aparece duplicada.
    tag: `aviso-${notificacao._id}`,
  };
}
