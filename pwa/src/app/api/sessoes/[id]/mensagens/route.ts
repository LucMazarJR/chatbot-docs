import { randomUUID } from 'node:crypto';

import { mensagens, sessoes } from '@/lib/db';
import { dentroDoLimite, identificar } from '@/lib/limite';
import { perguntar } from '@/lib/n8n';
import type { Mensagem } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const LIMITE_TEXTO = 1000;

/**
 * O texto exato que o prompt manda o agente responder quando nenhum trecho
 * serve. Reconhecê-lo é o que permite medir a taxa de "a base não sabia" sem
 * depender de o participante marcar nada.
 */
const RE_NAO_ENCONTREI = /^\s*desculpe\s*[—–-]\s*n[ãa]o encontrei/i;

type Contexto = { params: Promise<{ id: string }> };

/**
 * Transcrição da própria sessão, para o PWA se recompor depois de um refresh.
 *
 * No celular isso acontece o tempo todo — trocar de aplicativo e voltar, puxar
 * a tela para baixo sem querer. Sem esta rota, o participante voltaria para um
 * chat visualmente vazio embora a sessão continuasse viva no banco e na memória
 * do Redis, e concluiria que o protótipo se perdeu.
 *
 * A projeção é enxuta de propósito: `trechosDebug` e `latenciaMs` são dados de
 * análise, não têm por que trafegar para a tela do participante.
 */
export async function GET(_requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const sessao = await (await sessoes()).findOne({ _id: id });
  if (!sessao) return Response.json({ erro: 'sessão não encontrada' }, { status: 404 });

  const lista = await (await mensagens())
    .find({ sessaoId: id }, { projection: { papel: 1, texto: 1, em: 1, erro: 1, feedback: 1 } })
    .sort({ em: 1 })
    .toArray();

  return Response.json({
    nome: sessao.nome,
    encerrada: Boolean(sessao.encerradaEm),
    mensagens: lista,
  });
}

export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const corpo = (await requisicao.json().catch(() => ({}))) as { texto?: string };
  const texto = String(corpo.texto ?? '').trim();

  if (!texto) return Response.json({ erro: 'texto vazio' }, { status: 400 });
  if (texto.length > LIMITE_TEXTO) {
    return Response.json({ erro: 'texto muito longo' }, { status: 400 });
  }
  if (!dentroDoLimite(identificar(requisicao))) {
    return Response.json(
      { erro: 'muitas mensagens em pouco tempo, aguarde alguns minutos' },
      { status: 429 },
    );
  }

  const colSessoes = await sessoes();
  const colMensagens = await mensagens();

  const sessao = await colSessoes.findOne({ _id: id });
  if (!sessao) return Response.json({ erro: 'sessão não encontrada' }, { status: 404 });
  if (sessao.encerradaEm) return Response.json({ erro: 'sessão já encerrada' }, { status: 409 });

  const correlationId = randomUUID();

  const pergunta: Mensagem = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'user',
    texto,
    em: new Date(),
    correlationId,
  };
  await colMensagens.insertOne(pergunta);

  const resultado = await perguntar({
    sessaoId: sessao._id,
    mensagemId: pergunta._id,
    texto,
    nome: sessao.nome,
    correlationId,
  });

  const semResposta = resultado.temContexto === false || RE_NAO_ENCONTREI.test(resultado.resposta);

  const respostaBot: Mensagem = {
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
  await colMensagens.insertOne(respostaBot);

  return Response.json({
    mensagemId: respostaBot._id,
    resposta: respostaBot.texto,
    latenciaMs: respostaBot.latenciaMs,
    erro: respostaBot.erro,
  });
}
