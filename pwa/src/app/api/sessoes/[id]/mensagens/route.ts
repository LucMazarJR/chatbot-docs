import { randomUUID } from 'node:crypto';

import { mensagens, sessoes } from '@/lib/db';
import { dentroDoLimite, identificar } from '@/lib/limite';
import { perguntar } from '@/lib/n8n';
import type { Mensagem } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * Teto de execução da função, em segundos — só tem efeito na Vercel.
 *
 * O padrão de lá é 10s, e uma resposta leva 6 a 9s no caminho feliz: embedding,
 * busca no Atlas e Gemini. Quando o modelo devolve sobrecarga, o AI Agent ainda
 * tenta 3 vezes com 3s de intervalo, e o total passa fácil de 30s. Com o padrão
 * de 10s, essas mensagens morreriam com erro de plataforma em vez de esperar.
 *
 * 60 é o máximo do plano Hobby, e fica acima do PWA_N8N_TIMEOUT_MS (45s), que é
 * quem deve decidir a desistência — assim a falha vira a mensagem de
 * indisponibilidade do WhatsApp, e não um 504 da Vercel.
 */
export const maxDuration = 60;

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
    // A saudação é remontada no cliente e não existe no banco. Sem a hora de
    // início, ela apareceria carimbada com a hora do refresh — acima de
    // mensagens mais antigas, e com o relógio andando para trás na tela.
    iniciadaEm: sessao.iniciadaEm,
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
  if (!(await dentroDoLimite(identificar(requisicao)))) {
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
    // Sem isto, toda falha fica idêntica na base — timeout, token errado e
    // variável ausente viram a mesma linha, e diagnosticar exige achar o log
    // da requisição certa. Nunca chega à tela do participante.
    motivoErro: resultado.motivo ?? null,
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
