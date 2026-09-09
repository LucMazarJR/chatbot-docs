/**
 * Formato dos dados do protótipo, num lugar só.
 *
 * `Sessao` e `Mensagem` são exatamente o que vai para o MongoDB — não há
 * camada de mapeamento entre banco e aplicação, de propósito: é um protótipo de
 * validação, e uma indireção a mais só atrapalharia quem for ler isto depois.
 */

/** Um trecho recuperado da busca vetorial, com o veredito do filtro de score. */
export type TrechoDebug = {
  score: number;
  /** `false` quando o trecho ficou abaixo do limiar e não chegou ao agente. */
  usado: boolean;
  category: string | null;
  question: string | null;
  previa: string | null;
};

export type Sessao = {
  _id: string;
  nome: string;
  iniciadaEm: Date;
  encerradaEm: Date | null;
  userAgent: string;
  avaliacao: Avaliacao | null;
};

export type Avaliacao = {
  estrelas: number | null;
  nps: number | null;
  comentario: string | null;
  avaliadaEm: Date;
};

export type Papel = 'user' | 'bot';
export type Voto = 'up' | 'down';

export type Mensagem = {
  _id: string;
  sessaoId: string;
  papel: Papel;
  texto: string;
  em: Date;
  correlationId: string;

  // Preenchidos só nas mensagens do bot.
  latenciaMs?: number;
  temContexto?: boolean | null;
  qtdTrechos?: number | null;
  trechosDebug?: TrechoDebug[];
  limiarScore?: number | null;
  modelo?: string | null;
  /** O agente respondeu o texto de "não encontrei", ou a busca não trouxe nada. */
  semResposta?: boolean;
  erro?: boolean;
  /** Por que falhou: timeout, HTTP 404 do n8n, variável ausente. Só quando `erro`. */
  motivoErro?: string | null;
  feedback?: Voto | null;
  feedbackEm?: Date;
};

/** Resposta do fluxo do n8n em `/webhook/pwa-chat`. */
export type RespostaFluxo = {
  ok: boolean;
  erro?: boolean;
  motivo?: string;
  resposta: string;
  temContexto: boolean | null;
  qtdTrechos: number | null;
  trechosDebug: TrechoDebug[];
  limiarScore: number | null;
  modelo: string | null;
  latenciaMs: number;
};

/** Linha da lista de sessões na tela de revisão. */
export type SessaoResumida = Sessao & {
  qtdMensagens: number;
  qtdPerguntas: number;
  positivos: number;
  negativos: number;
  semResposta: number;
};

export type Estatisticas = {
  /** Só as que tiveram ao menos uma pergunta. */
  sessoes: number;
  /** Visitas que abriram a página e saíram sem perguntar nada. */
  sessoesVazias: number;
  sessoesAvaliadas: number;
  mensagens: number;
  respostas: number;
  notaMedia: number | null;
  npsMedio: number | null;
  npsScore: number | null;
  percentualSemResposta: number | null;
  erros: number;
  positivos: number;
  negativos: number;
  latenciaMedia: number | null;
  latenciaP95: number | null;
};

/**
 * Filtros da lista de sessões.
 *
 * `validas` é o padrão e esconde as sessões sem nenhuma pergunta; `todas` é o
 * único que as mostra.
 */
export type Filtro = 'validas' | 'todas' | 'negativos' | 'nota-baixa' | 'sem-resposta';
