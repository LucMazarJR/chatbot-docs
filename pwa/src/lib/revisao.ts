import { mensagens, sessoes } from './db';
import type {
  Estatisticas,
  Filtro,
  FiltroVersao,
  Mensagem,
  Periodo,
  Sessao,
  SessaoResumida,
} from './tipos';

/**
 * Consultas da tela de revisão.
 *
 * As agregações são deliberadamente simples e sem paginação no servidor: a
 * validação tem escala de dezenas a centenas de sessões, e um `$lookup` nesse
 * volume custa milissegundos. Otimizar aqui seria complexidade sem problema
 * correspondente.
 */

/** Início do intervalo, ou `null` quando o filtro é "tudo". */
function desde(periodo: Periodo): Date | null {
  const agora = new Date();

  if (periodo === 'hoje') {
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);
    return inicio;
  }
  if (periodo === '7d') return new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (periodo === '30d') return new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

/**
 * Filtro base das sessões: recorte de tempo e de interface.
 *
 * Sessões antigas não têm o campo `versao` — são anteriores à existência das
 * duas interfaces. Elas contam como "a", que era a única que existia.
 */
function filtroDeSessao(periodo: Periodo, versao: FiltroVersao) {
  const filtro: Record<string, unknown> = {};

  const inicio = desde(periodo);
  if (inicio) filtro.iniciadaEm = { $gte: inicio };

  if (versao === 'a') filtro.$or = [{ versao: 'a' }, { versao: { $exists: false } }];
  else if (versao === 'b') filtro.versao = 'b';

  return filtro;
}

/** Números do topo da tela, já recortados por período e interface. */
export async function estatisticas(
  periodo: Periodo = 'tudo',
  versao: FiltroVersao = 'todas',
): Promise<Estatisticas> {
  const colSessoes = await sessoes();
  const colMensagens = await mensagens();

  const base = filtroDeSessao(periodo, versao);
  const noRecorte = await colSessoes.find(base, { projection: { _id: 1 } }).toArray();
  const idsNoRecorte = noRecorte.map((s) => s._id);

  // Sessão sem pergunta nenhuma é visita, não conversa. Contá-la afundaria o
  // total e a taxa de avaliação — números que alguém lê como "quantas pessoas
  // conversaram".
  const comPergunta = await colMensagens.distinct('sessaoId', {
    sessaoId: { $in: idsNoRecorte },
    papel: 'user',
  });

  const [porSessao, porMensagem, latencias] = await Promise.all([
    colSessoes
      .aggregate<{
        total: number;
        avaliadas: number;
        somaEstrelas: number;
        qtdEstrelas: number;
        somaNps: number;
        qtdNps: number;
        promotores: number;
        detratores: number;
      }>([
        { $match: { _id: { $in: comPergunta } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avaliadas: { $sum: { $cond: [{ $ifNull: ['$avaliacao', false] }, 1, 0] } },
            somaEstrelas: { $sum: '$avaliacao.estrelas' },
            qtdEstrelas: { $sum: { $cond: [{ $ifNull: ['$avaliacao.estrelas', false] }, 1, 0] } },
            somaNps: { $sum: '$avaliacao.nps' },
            qtdNps: {
              $sum: { $cond: [{ $ne: [{ $ifNull: ['$avaliacao.nps', null] }, null] }, 1, 0] },
            },
            promotores: {
              $sum: { $cond: [{ $gte: [{ $ifNull: ['$avaliacao.nps', -1] }, 9] }, 1, 0] },
            },
            detratores: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$avaliacao.nps', null] }, null] },
                      { $lte: ['$avaliacao.nps', 6] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),

    colMensagens
      .aggregate<{
        total: number;
        doBot: number;
        semResposta: number;
        erros: number;
        positivos: number;
        negativos: number;
      }>([
        { $match: { sessaoId: { $in: comPergunta } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            doBot: { $sum: { $cond: [{ $eq: ['$papel', 'bot'] }, 1, 0] } },
            semResposta: { $sum: { $cond: ['$semResposta', 1, 0] } },
            erros: { $sum: { $cond: ['$erro', 1, 0] } },
            positivos: { $sum: { $cond: [{ $eq: ['$feedback', 'up'] }, 1, 0] } },
            negativos: { $sum: { $cond: [{ $eq: ['$feedback', 'down'] }, 1, 0] } },
          },
        },
      ])
      .toArray(),

    colMensagens
      .find(
        { sessaoId: { $in: comPergunta }, papel: 'bot', latenciaMs: { $gt: 0 } },
        { projection: { latenciaMs: 1 } },
      )
      .toArray(),
  ]);

  const s = porSessao[0];
  const m = porMensagem[0];
  const tempos = latencias.map((x) => x.latenciaMs ?? 0);

  return {
    sessoes: s?.total ?? 0,
    // Quantas foram descartadas por não terem pergunta nenhuma. Fica à vista
    // para ninguém achar que sumiram sessões sem explicação.
    sessoesVazias: Math.max(0, idsNoRecorte.length - (s?.total ?? 0)),
    sessoesAvaliadas: s?.avaliadas ?? 0,
    mensagens: m?.total ?? 0,
    respostas: m?.doBot ?? 0,
    notaMedia: s?.qtdEstrelas ? s.somaEstrelas / s.qtdEstrelas : null,
    npsMedio: s?.qtdNps ? s.somaNps / s.qtdNps : null,
    // NPS clássico: promotores (9–10) menos detratores (0–6), em pontos
    // percentuais. Passivos (7–8) contam só no denominador.
    npsScore: s?.qtdNps ? Math.round(((s.promotores - s.detratores) / s.qtdNps) * 100) : null,
    // A métrica central da validação: com que frequência a base não respondeu.
    percentualSemResposta: m?.doBot ? (m.semResposta / m.doBot) * 100 : null,
    erros: m?.erros ?? 0,
    positivos: m?.positivos ?? 0,
    negativos: m?.negativos ?? 0,
    latenciaMedia: media(tempos),
    latenciaP95: percentil(tempos, 95),
    // Quantas respostas passaram de 30s. Com os tempos observados no uso real,
    // é o número que diz se a espera está virando um problema de experiência.
    respostasLentas: tempos.filter((t) => t >= 30_000).length,
  };
}

/**
 * Lista de sessões com os contadores que os filtros usam.
 *
 * Sessão sem nenhuma pergunta não é conversa: é alguém que abriu o link e saiu,
 * ou uma aba recarregada. Elas nascem em cada visita, porque a sessão é criada
 * ao carregar a página, e se ficassem no meio da lista diluiriam as conversas
 * de verdade. Por isso só aparecem no filtro "Todas".
 */
export async function listarSessoes(
  filtro: Filtro = 'validas',
  periodo: Periodo = 'tudo',
  versao: FiltroVersao = 'todas',
  limite = 200,
) {
  const colSessoes = await sessoes();

  const pipeline: Record<string, unknown>[] = [
    { $match: filtroDeSessao(periodo, versao) },
    { $sort: { iniciadaEm: -1 } },
    {
      $lookup: {
        from: 'mensagens',
        localField: '_id',
        foreignField: 'sessaoId',
        as: 'msgs',
      },
    },
    {
      $addFields: {
        qtdMensagens: { $size: '$msgs' },
        qtdPerguntas: {
          $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.papel', 'user'] } } },
        },
        negativos: {
          $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.feedback', 'down'] } } },
        },
        positivos: {
          $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.feedback', 'up'] } } },
        },
        semResposta: {
          $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.semResposta', true] } } },
        },
        erros: {
          $size: { $filter: { input: '$msgs', cond: { $eq: ['$$this.erro', true] } } },
        },
        latenciaMaxima: { $max: '$msgs.latenciaMs' },
      },
    },
    { $project: { msgs: 0 } },
  ];

  // "todas" é o único filtro que mostra as sessões vazias.
  if (filtro !== 'todas') pipeline.push({ $match: { qtdPerguntas: { $gt: 0 } } });

  if (filtro === 'negativos') pipeline.push({ $match: { negativos: { $gt: 0 } } });
  else if (filtro === 'nota-baixa') pipeline.push({ $match: { 'avaliacao.estrelas': { $lte: 3 } } });
  else if (filtro === 'sem-resposta') pipeline.push({ $match: { semResposta: { $gt: 0 } } });
  else if (filtro === 'com-erro') pipeline.push({ $match: { erros: { $gt: 0 } } });

  // O corte vem depois dos filtros, e não junto do $sort: cortando antes, um
  // filtro estreito devolveria menos linhas do que existem só porque as 200
  // mais recentes não continham as que interessam.
  pipeline.push({ $limit: limite });

  return colSessoes.aggregate<SessaoResumida>(pipeline).toArray();
}

/** Transcrição completa de uma sessão, com os metadados de cada resposta. */
export async function detalharSessao(id: string) {
  const sessao = await (await sessoes()).findOne({ _id: id });
  if (!sessao) return null;

  const transcricao = await (await mensagens()).find({ sessaoId: id }).sort({ em: 1 }).toArray();
  return { sessao, mensagens: transcricao };
}

type LinhaExportacao = Mensagem & { sessao?: Sessao };

/** Uma linha por mensagem, para abrir em planilha. */
export async function exportarCsv(): Promise<string> {
  const linhas = await (await mensagens())
    .aggregate<LinhaExportacao>([
      { $sort: { em: 1 } },
      {
        $lookup: { from: 'sessoes', localField: 'sessaoId', foreignField: '_id', as: 'sessao' },
      },
      { $unwind: { path: '$sessao', preserveNullAndEmptyArrays: true } },
    ])
    .toArray();

  const cabecalho = [
    'sessaoId',
    'versao',
    'participante',
    'em',
    'papel',
    'texto',
    'latenciaMs',
    'temContexto',
    'qtdTrechos',
    'semResposta',
    'erro',
    'motivoErro',
    'feedback',
    'feedbackComentario',
    'estrelas',
    'nps',
    'comentario',
  ];

  const corpo = linhas.map((l) =>
    [
      l.sessaoId,
      l.sessao?.versao ?? 'a',
      l.sessao?.nome ?? '',
      l.em instanceof Date ? l.em.toISOString() : '',
      l.papel,
      l.texto,
      l.latenciaMs ?? '',
      l.temContexto ?? '',
      l.qtdTrechos ?? '',
      l.semResposta ?? '',
      l.erro ?? '',
      l.motivoErro ?? '',
      l.feedback ?? '',
      l.feedbackComentario ?? '',
      l.sessao?.avaliacao?.estrelas ?? '',
      l.sessao?.avaliacao?.nps ?? '',
      l.sessao?.avaliacao?.comentario ?? '',
    ]
      .map(campoCsv)
      .join(','),
  );

  // BOM na frente: sem ele o Excel em pt-BR abre os acentos quebrados.
  return '﻿' + [cabecalho.join(','), ...corpo].join('\r\n');
}

export async function exportarJson() {
  const [todasSessoes, todasMensagens] = await Promise.all([
    (await sessoes()).find().sort({ iniciadaEm: 1 }).toArray(),
    (await mensagens()).find().sort({ em: 1 }).toArray(),
  ]);

  return {
    exportadoEm: new Date().toISOString(),
    sessoes: todasSessoes.map((s) => ({
      ...s,
      mensagens: todasMensagens.filter((m) => m.sessaoId === s._id),
    })),
  };
}

/** Aspas duplicadas, campo inteiro entre aspas: respostas têm vírgula e quebra de linha. */
function campoCsv(valor: unknown): string {
  return '"' + String(valor ?? '').replace(/"/g, '""') + '"';
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, indice)];
}
