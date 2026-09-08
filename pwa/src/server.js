import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';

import * as revisao from './admin.js';
import { conectar, desconectar, mensagens, ping, sessoes } from './db.js';
import { perguntar } from './n8n.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const LIMITE_TEXTO = 1000;
const LIMITE_NOME = 60;
const LIMITE_COMENTARIO = 2000;

/**
 * O texto exato que o prompt manda o agente responder quando nenhum trecho
 * serve. Reconhecê-lo é o que permite medir a taxa de "a base não sabia" sem
 * depender de o participante marcar nada.
 */
const RE_NAO_ENCONTREI = /^\s*desculpe\s*[—–-]\s*n[ãa]o encontrei/i;

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    redact: ['req.headers.authorization', 'req.headers["x-webhook-token"]'],
  },
  // O proxy é o cloudflared; sem isto o IP de todo mundo vira o da rede docker.
  trustProxy: true,
});

// ---------------------------------------------------------------------------
// Freio de mão contra queimar a cota do Gemini
//
// O acesso é aberto de propósito (o link circula entre participantes), mas a
// cota gratuita é de 500 conversas/dia. Sem nenhum limite, uma aba deixada
// segurando F5 — ou alguém curioso com o link — derruba o teste do dia inteiro.
// Janela deslizante simples em memória: reiniciar o container zera, e tudo bem,
// isto é proteção contra acidente, não contra ataque.
// ---------------------------------------------------------------------------
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 40;
const historico = new Map();

function dentroDoLimite(ip) {
  const agora = Date.now();
  const registros = (historico.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  registros.push(agora);
  historico.set(ip, registros);

  // Limpeza preguiçosa: sem isto o Map cresce para sempre com IPs de uma visita.
  if (historico.size > 500) {
    for (const [chave, marcas] of historico) {
      if (marcas.every((t) => agora - t >= JANELA_MS)) historico.delete(chave);
    }
  }

  return registros.length <= MAX_POR_JANELA;
}

// ---------------------------------------------------------------------------
// Estáticos
// ---------------------------------------------------------------------------
await app.register(fastifyStatic, {
  root: join(RAIZ, 'public'),
  prefix: '/',
  // O service worker precisa ser servido sem cache, senão o navegador segura
  // uma versão antiga e a atualização do protótipo nunca chega ao participante.
  setHeaders(res, caminho) {
    if (caminho.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
});

// `/admin` sem barra no fim não bate no index.html do diretório.
app.get('/admin', (_req, resposta) => resposta.redirect('/admin/'));

// ---------------------------------------------------------------------------
// Proteção opcional da tela de revisão
//
// Vazia por padrão: a decisão foi deixar o protótipo aberto. Preencher
// PWA_ADMIN_PASSWORD no .env liga a exigência sem mexer em código — útil se o
// link circular mais do que o previsto.
// ---------------------------------------------------------------------------
app.addHook('onRequest', async (req, resposta) => {
  const senha = process.env.PWA_ADMIN_PASSWORD;
  if (!senha) return;
  if (!req.url.startsWith('/admin') && !req.url.startsWith('/api/admin')) return;

  const cabecalho = req.headers.authorization ?? '';
  const [tipo, credencial] = cabecalho.split(' ');
  const informada =
    tipo === 'Basic' ? Buffer.from(credencial ?? '', 'base64').toString().split(':')[1] : null;

  if (informada !== senha) {
    resposta.header('WWW-Authenticate', 'Basic realm="Revisao"');
    return resposta.code(401).send({ erro: 'nao autorizado' });
  }
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

app.post('/api/sessoes', async (req, resposta) => {
  const nome = String(req.body?.nome ?? '')
    .trim()
    .slice(0, LIMITE_NOME);

  const sessao = {
    _id: randomUUID(),
    nome: nome || 'Participante',
    iniciadaEm: new Date(),
    encerradaEm: null,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    avaliacao: null,
  };

  await sessoes().insertOne(sessao);
  req.log.info({ sessaoId: sessao._id }, 'sessão criada');

  return resposta.code(201).send({ sessaoId: sessao._id, nome: sessao.nome });
});

app.post('/api/sessoes/:id/mensagens', async (req, resposta) => {
  const texto = String(req.body?.texto ?? '').trim();

  if (!texto) return resposta.code(400).send({ erro: 'texto vazio' });
  if (texto.length > LIMITE_TEXTO) return resposta.code(400).send({ erro: 'texto muito longo' });
  if (!dentroDoLimite(req.ip)) {
    return resposta
      .code(429)
      .send({ erro: 'muitas mensagens em pouco tempo, aguarde alguns minutos' });
  }

  const sessao = await sessoes().findOne({ _id: req.params.id });
  if (!sessao) return resposta.code(404).send({ erro: 'sessão não encontrada' });
  if (sessao.encerradaEm) return resposta.code(409).send({ erro: 'sessão já encerrada' });

  const correlationId = randomUUID();

  const pergunta = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'user',
    texto,
    em: new Date(),
    correlationId,
  };
  await mensagens().insertOne(pergunta);

  const resultado = await perguntar(
    {
      sessaoId: sessao._id,
      mensagemId: pergunta._id,
      texto,
      nome: sessao.nome,
      correlationId,
    },
    req.log,
  );

  const semResposta = resultado.temContexto === false || RE_NAO_ENCONTREI.test(resultado.resposta);

  const respostaBot = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'bot',
    texto: resultado.resposta,
    em: new Date(),
    correlationId,
    latenciaMs: resultado.latenciaMs,
    temContexto: resultado.temContexto,
    qtdTrechos: resultado.qtdTrechos,
    trechosDebug: resultado.trechosDebug,
    limiarScore: resultado.limiarScore,
    modelo: resultado.modelo,
    semResposta,
    erro: Boolean(resultado.erro),
    feedback: null,
  };
  await mensagens().insertOne(respostaBot);

  return {
    mensagemId: respostaBot._id,
    resposta: respostaBot.texto,
    latenciaMs: respostaBot.latenciaMs,
    erro: respostaBot.erro,
  };
});

app.post('/api/mensagens/:id/feedback', async (req, resposta) => {
  const voto = req.body?.voto;
  if (voto !== 'up' && voto !== 'down' && voto !== null) {
    return resposta.code(400).send({ erro: 'voto inválido' });
  }

  const { matchedCount } = await mensagens().updateOne(
    { _id: req.params.id, papel: 'bot' },
    { $set: { feedback: voto, feedbackEm: new Date() } },
  );

  if (!matchedCount) return resposta.code(404).send({ erro: 'mensagem não encontrada' });
  return { ok: true };
});

app.post('/api/sessoes/:id/avaliacao', async (req, resposta) => {
  const estrelas = inteiroNoIntervalo(req.body?.estrelas, 1, 5);
  const nps = inteiroNoIntervalo(req.body?.nps, 0, 10);
  const comentario = String(req.body?.comentario ?? '')
    .trim()
    .slice(0, LIMITE_COMENTARIO);

  // Estrelas e NPS são opcionais separadamente: quem quer só fechar a conversa
  // sem responder nada não deve ficar preso a um formulário.
  const { matchedCount } = await sessoes().updateOne(
    { _id: req.params.id },
    {
      $set: {
        avaliacao: { estrelas, nps, comentario: comentario || null, avaliadaEm: new Date() },
        encerradaEm: new Date(),
      },
    },
  );

  if (!matchedCount) return resposta.code(404).send({ erro: 'sessão não encontrada' });

  req.log.info({ sessaoId: req.params.id, estrelas, nps }, 'sessão avaliada');
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Revisão
// ---------------------------------------------------------------------------

app.get('/api/admin/estatisticas', () => revisao.estatisticas());

app.get('/api/admin/sessoes', (req) => revisao.listarSessoes({ filtro: req.query?.filtro ?? null }));

app.get('/api/admin/sessoes/:id', async (req, resposta) => {
  const detalhe = await revisao.detalharSessao(req.params.id);
  if (!detalhe) return resposta.code(404).send({ erro: 'sessão não encontrada' });
  return detalhe;
});

app.get('/api/admin/exportar.csv', async (_req, resposta) => {
  const csv = await revisao.exportarCsv();
  return resposta
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', 'attachment; filename="prototipo-pwa-' + hoje() + '.csv"')
    .send(csv);
});

app.get('/api/admin/exportar.json', async (_req, resposta) => {
  const dados = await revisao.exportarJson();
  return resposta
    .header('Content-Disposition', 'attachment; filename="prototipo-pwa-' + hoje() + '.json"')
    .send(dados);
});

// ---------------------------------------------------------------------------

app.get('/health', async (_req, resposta) => {
  try {
    await ping();
    return { status: 'ok' };
  } catch (erro) {
    return resposta.code(503).send({ status: 'sem banco', motivo: erro.message });
  }
});

function inteiroNoIntervalo(valor, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) return null;
  return numero;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------

try {
  await conectar(app.log);
  await app.listen({ port: Number(process.env.PORT || 8080), host: '0.0.0.0' });
} catch (erro) {
  app.log.error(erro, 'falha ao subir');
  process.exit(1);
}

for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, async () => {
    await app.close();
    await desconectar();
    process.exit(0);
  });
}
