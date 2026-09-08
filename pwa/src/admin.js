import { mensagens, sessoes } from './db.js';

/**
 * Consultas da tela de revisão.
 *
 * As agregações são deliberadamente simples e sem paginação no servidor: a
 * validação tem escala de dezenas a centenas de sessões, e um `$lookup` nesse
 * volume custa milissegundos. Otimizar aqui seria complexidade sem problema
 * correspondente.
 */

/** Números do topo da tela. */
export async function estatisticas() {
  const [porSessao, porMensagem] = await Promise.all([
    sessoes()
      .aggregate([
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

    mensagens()
      .aggregate([
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
  ]);

  const s = porSessao[0] ?? {};
  const m = porMensagem[0] ?? {};

  const latencias = await mensagens()
    .find({ papel: 'bot', latenciaMs: { $gt: 0 } }, { projection: { latenciaMs: 1 } })
    .toArray();

  return {
    sessoes: s.total ?? 0,
    sessoesAvaliadas: s.avaliadas ?? 0,
    mensagens: m.total ?? 0,
    respostas: m.doBot ?? 0,
    notaMedia: s.qtdEstrelas ? s.somaEstrelas / s.qtdEstrelas : null,
    npsMedio: s.qtdNps ? s.somaNps / s.qtdNps : null,
    // NPS clássico: promotores (9–10) menos detratores (0–6), em pontos
    // percentuais. Passivos (7–8) contam só no denominador.
    npsScore: s.qtdNps ? Math.round(((s.promotores - s.detratores) / s.qtdNps) * 100) : null,
    // A métrica central da validação: com que frequência a base não respondeu.
    percentualSemResposta: m.doBot ? (m.semResposta / m.doBot) * 100 : null,
    erros: m.erros ?? 0,
    positivos: m.positivos ?? 0,
    negativos: m.negativos ?? 0,
    latenciaMedia: media(latencias.map((x) => x.latenciaMs)),
    latenciaP95: percentil(
      latencias.map((x) => x.latenciaMs),
      95,
    ),
  };
}

/**
 * Lista de sessões com os contadores que os filtros usam.
 *
 * `filtro` aceita: 'negativos' (tem polegar para baixo), 'nota-baixa'
 * (estrelas ≤ 3) e 'sem-resposta'.
 */
export async function listarSessoes({ filtro = null, limite = 200 } = {}) {
  const pipeline = [
    { $sort: { iniciadaEm: -1 } },
    { $limit: limite },
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
      },
    },
    { $project: { msgs: 0 } },
  ];

  if (filtro === 'negativos') {
    pipeline.push({ $match: { negativos: { $gt: 0 } } });
  } else if (filtro === 'nota-baixa') {
    pipeline.push({ $match: { 'avaliacao.estrelas': { $lte: 3 } } });
  } else if (filtro === 'sem-resposta') {
    pipeline.push({ $match: { semResposta: { $gt: 0 } } });
  }

  return sessoes().aggregate(pipeline).toArray();
}

/** Transcrição completa de uma sessão, com os metadados de cada resposta. */
export async function detalharSessao(id) {
  const sessao = await sessoes().findOne({ _id: id });
  if (!sessao) return null;

  const transcricao = await mensagens().find({ sessaoId: id }).sort({ em: 1 }).toArray();
  return { sessao, mensagens: transcricao };
}

/** Uma linha por mensagem, para abrir em planilha. */
export async function exportarCsv() {
  const linhas = await mensagens()
    .aggregate([
      { $sort: { em: 1 } },
      {
        $lookup: {
          from: 'sessoes',
          localField: 'sessaoId',
          foreignField: '_id',
          as: 'sessao',
        },
      },
      { $unwind: { path: '$sessao', preserveNullAndEmptyArrays: true } },
    ])
    .toArray();

  const cabecalho = [
    'sessaoId',
    'participante',
    'em',
    'papel',
    'texto',
    'latenciaMs',
    'temContexto',
    'qtdTrechos',
    'semResposta',
    'erro',
    'feedback',
    'estrelas',
    'nps',
    'comentario',
  ];

  const corpo = linhas.map((l) =>
    [
      l.sessaoId,
      l.sessao?.nome ?? '',
      l.em?.toISOString?.() ?? '',
      l.papel,
      l.texto,
      l.latenciaMs ?? '',
      l.temContexto ?? '',
      l.qtdTrechos ?? '',
      l.semResposta ?? '',
      l.erro ?? '',
      l.feedback ?? '',
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
    sessoes().find().sort({ iniciadaEm: 1 }).toArray(),
    mensagens().find().sort({ em: 1 }).toArray(),
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
function campoCsv(valor) {
  return '"' + String(valor ?? '').replace(/"/g, '""') + '"';
}

function media(valores) {
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function percentil(valores, p) {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, indice)];
}
