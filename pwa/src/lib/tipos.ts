/**
 * Formato dos dados do protótipo, num lugar só.
 *
 * `Sessao` e `Mensagem` são exatamente o que vai para o MongoDB — não há
 * camada de mapeamento entre banco e aplicação, de propósito: é um protótipo de
 * validação, e uma indireção a mais só atrapalharia quem for ler isto depois.
 *
 * O painel que lia estes dados vive agora no Dashboard-PetSaúde, que declara os
 * próprios tipos em `front/src/lib/conversas.functions.ts` e os próprios schemas
 * em `back/src/conversas/schemas/`. Este arquivo continua sendo o dono do
 * formato: mudar um campo aqui exige mudar lá na mesma alteração.
 */

/** Um trecho recuperado da busca vetorial, com o veredito do filtro de score. */
export type TrechoDebug = {
  score: number;
  /** `false` quando o trecho ficou abaixo do limiar e não chegou ao agente. */
  usado: boolean;
  /**
   * Id da FAQ no Mongo.
   *
   * É o que liga a conversa ao conteúdo: a revisão usa este id para levar de
   * uma resposta ruim direto ao documento que precisa ser corrigido. Buscar
   * pelo texto não serviria — há 180 FAQs com a pergunta "Como me preparar
   * para o Exame?", distinguidas só pelo assunto.
   *
   * Pode vir nulo: o nó do vector store não documenta sob qual chave devolve o
   * id, e o formato de saída dele já mudou entre versões.
   */
  faqId: string | null;
  category: string | null;
  question: string | null;
  previa: string | null;
};

/**
 * Qual das duas interfaces em avaliação gerou a conversa.
 *
 * O protótipo apresenta dois desenhos concorrentes da mesma conversa, e o grupo
 * precisa escolher um. Sem marcar a origem, as métricas da revisão misturariam
 * os dois e não responderiam à única pergunta que motivou o teste.
 */
export type Versao = 'a' | 'b';

export type Sessao = {
  _id: string;
  nome: string;
  versao: Versao;
  iniciadaEm: Date;
  encerradaEm: Date | null;
  userAgent: string;
  avaliacao: Avaliacao | null;

  /**
   * Quando a pessoa aceitou os termos.
   *
   * Guardar a data é o que transforma o aviso em evidência: numa auditoria de
   * LGPD, "avisamos na tela" vale menos que "esta conversa começou às 14h32
   * com aceite às 14h31". Nulo enquanto ninguém aceitou.
   */
  consentimentoEm?: Date | null;
  consentimentoRecusadoEm?: Date | null;
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

  /**
   * A resposta ainda não chegou do n8n.
   *
   * A mensagem do bot nasce vazia e pendente assim que a pergunta é aceita, e o
   * n8n a preenche depois pelo retorno. É o que permite o fluxo demorar 3
   * minutos sem nenhuma requisição ficar aberta esperando.
   */
  pendente?: boolean;

  // Preenchidos só nas mensagens do bot.
  latenciaMs?: number;
  temContexto?: boolean | null;
  qtdTrechos?: number | null;
  trechosDebug?: TrechoDebug[];
  limiarScore?: number | null;
  modelo?: string | null;
  /** O agente respondeu o texto de "não encontrei" — lacuna de conteúdo. */
  semResposta?: boolean;
  erro?: boolean;
  /** Por que falhou: timeout, HTTP 404 do n8n, variável ausente. Só quando `erro`. */
  motivoErro?: string | null;
  feedback?: Voto | null;
  /** Texto opcional que a versão B pede junto do polegar. */
  feedbackComentario?: string | null;
  feedbackEm?: Date;
};

/**
 * Por que a resposta falhou, em categoria grossa.
 *
 * Existe para a tela poder dizer algo útil — "demorei demais" é uma informação
 * que o participante entende e que muda o que ele faz em seguida (tentar de
 * novo). O `motivo` detalhado fica no banco, para a equipe; esta categoria é o
 * único pedaço que chega ao navegador.
 */
export type CausaErro =
  /** O fluxo não terminou a tempo. Tentar de novo costuma resolver. */
  | 'demora'
  /** Não deu para falar com o n8n: serviço parado, rota errada, token errado.
   *  Tentar de novo não adianta — alguém precisa religar ou consertar. */
  | 'fora-do-ar'
  /** Falhou por outro motivo. */
  | 'indisponivel';

/** Resposta do fluxo do n8n em `/webhook/pwa-chat`. */
export type RespostaFluxo = {
  ok: boolean;
  erro?: boolean;
  motivo?: string;
  causa?: CausaErro;
  resposta: string;
  temContexto: boolean | null;
  qtdTrechos: number | null;
  trechosDebug: TrechoDebug[];
  limiarScore: number | null;
  modelo: string | null;
  latenciaMs: number;
};
