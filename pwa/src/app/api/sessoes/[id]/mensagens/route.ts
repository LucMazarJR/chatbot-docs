import { randomUUID } from 'node:crypto';

import { lerAudio } from '@/lib/audio-da-mensagem';
import { mensagens, ORDEM_DA_CONVERSA } from '@/lib/db';
import { LIMITE_POR_CONVERSA, dentroDoLimite, identificar } from '@/lib/limite';
import { despachar, urlDeRetorno } from '@/lib/n8n';
import { autenticarSessao } from '@/lib/sessao-autenticada';
import type { Mensagem } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const LIMITE_TEXTO = 1000;

type Contexto = { params: Promise<{ id: string }> };

/**
 * Transcrição da própria sessão, para o PWA se recompor depois de um refresh.
 *
 * No celular isso acontece o tempo todo: trocar de aplicativo e voltar, puxar
 * a tela para baixo sem querer. Sem esta rota, o participante voltaria para um
 * chat visualmente vazio embora a sessão continuasse viva no banco e na memória
 * do Redis, e concluiria que o protótipo se perdeu.
 *
 * A projeção é enxuta de propósito: `trechosDebug` e `latenciaMs` são dados de
 * análise, não têm por que trafegar para a tela do participante.
 */
export async function GET(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;
  const { sessao } = autenticada;

  const lista = await (await mensagens())
    .find(
      { sessaoId: id },
      {
        projection: {
          papel: 1,
          texto: 1,
          em: 1,
          erro: 1,
          feedback: 1,
          pendente: 1,
          // Para a tela remontar os balões de áudio do staging.
          'audio.duracaoSegundos': 1,
          respostaEmAudio: 1,
        },
      },
    )
    .sort(ORDEM_DA_CONVERSA)
    .toArray();

  return Response.json({
    nome: sessao.nome,
    // A saudação é remontada no cliente e não existe no banco. Sem a hora de
    // início, ela apareceria carimbada com a hora do refresh: acima de
    // mensagens mais antigas, e com o relógio andando para trás na tela.
    iniciadaEm: sessao.iniciadaEm,
    encerrada: Boolean(sessao.encerradaEm),
    // Quem já aceitou não recebe o pedido de novo a cada recarga.
    consentimento: Boolean(sessao.consentimentoEm),
    // Uma resposta que ficou pendente de uma visita anterior não volta como
    // conversa: sem alguém esperando por ela, é ruído na transcrição.
    mensagens: lista.filter((m) => !m.pendente),
  });
}

/**
 * Aceita a pergunta e devolve na hora, sem esperar a resposta ficar pronta.
 *
 * A mensagem do bot nasce vazia e pendente; o n8n a preenche depois, pelo
 * retorno em `/api/n8n/resposta`. A tela fica consultando `/api/mensagens/:id`
 * até ela deixar de estar pendente.
 *
 * É esse desenho que permite o fluxo demorar três minutos. Antes a requisição
 * ficava aberta o tempo todo esperando, e na Vercel a plataforma matava a função
 * aos 60s: a resposta era gerada e se perdia no caminho.
 */
export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const corpo = (await requisicao.json().catch(() => ({}))) as {
    texto?: string;
    origem?: string;
    audio?: { duracaoSegundos?: unknown; modelo?: unknown; transcricaoMs?: unknown };
    limiteDeTempo?: unknown;
  };
  const texto = String(corpo.texto ?? '').trim();
  // Só o rótulo: o áudio do ditado nunca chega aqui, só o texto que ele virou.
  const porVoz = corpo.origem === 'voz';

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

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;
  const { sessao } = autenticada;

  // Depois da autenticação, e não antes: o id da conversa não é segredo, e
  // contar antes deixaria qualquer um esgotar o limite da conversa de outra pessoa.
  if (!(await dentroDoLimite(`conversa:${sessao._id}`, LIMITE_POR_CONVERSA))) {
    return Response.json(
      { erro: 'muitas mensagens em pouco tempo, aguarde alguns minutos' },
      { status: 429 },
    );
  }

  const colMensagens = await mensagens();

  if (sessao.encerradaEm) return Response.json({ erro: 'sessão já encerrada' }, { status: 409 });

  const correlationId = randomUUID();

  // Só a conversa do staging manda o histórico: é ela que vai para o fluxo
  // com reescrita, que usa as últimas 4 mensagens para entender "e lá?". Vão
  // 8 porque o modo com limite de tempo responde sem a memória do agente, e 8
  // são as 4 trocas que ela guarda. Lido antes de gravar a pergunta nova, para
  // ela não entrar duas vezes.
  const staging = Boolean(sessao.usuarioId);
  const historico = staging
    ? (
        await colMensagens
          .find(
            { sessaoId: sessao._id, pendente: { $ne: true }, tipo: { $exists: false } },
            { projection: { papel: 1, texto: 1 } },
          )
          .sort({ em: -1, papel: 1 })
          .limit(8)
          .toArray()
      )
        .reverse()
        .filter((m) => m.texto)
        .map((m) => ({ papel: m.papel, texto: m.texto }))
    : undefined;

  // Mensagem de áudio só existe no staging: no `/` o campo é ignorado, e a
  // mensagem fica exatamente como sempre foi.
  const audio = staging && porVoz ? lerAudio(corpo.audio) : null;

  // Staging: o modo de espera da resposta. Sem ele (tela antiga, `/`), o
  // fluxo segue pelo agente de sempre.
  const limiteDeTempo = staging && typeof corpo.limiteDeTempo === 'boolean' ? corpo.limiteDeTempo : undefined;

  const pergunta: Mensagem = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'user',
    texto,
    em: new Date(),
    correlationId,
    ...(porVoz ? { origem: 'voz' as const } : {}),
    ...(audio ? { audio } : {}),
  };

  const respostaBot: Mensagem = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'bot',
    texto: '',
    em: new Date(),
    correlationId,
    pendente: true,
    feedback: null,
    // Quem perguntou em áudio recebe a resposta em áudio, como no WhatsApp.
    ...(audio ? { respostaEmAudio: true } : {}),
    ...(limiteDeTempo !== undefined ? { comLimiteDeTempo: limiteDeTempo } : {}),
  };

  await colMensagens.insertMany([pergunta, respostaBot]);

  const entrega = await despachar({
    sessaoId: sessao._id,
    mensagemId: respostaBot._id,
    texto,
    nome: sessao.nome,
    correlationId,
    urlDeRetorno: urlDeRetorno(requisicao),
    staging,
    historico,
    limiteDeTempo,
  });

  if (!entrega.aceito) {
    // Nem chegou a ser processada: marca a pendência como falha agora, senão a
    // tela ficaria consultando uma resposta que nunca virá.
    await colMensagens.updateOne(
      { _id: respostaBot._id },
      {
        $set: {
          pendente: false,
          erro: true,
          motivoErro: entrega.motivo,
          latenciaMs: Date.now() - respostaBot.em.getTime(),
        },
      },
    );

    return Response.json(
      { mensagemId: respostaBot._id, pendente: false, erro: true, causa: entrega.causa },
      { status: 202 },
    );
  }

  return Response.json({ mensagemId: respostaBot._id, pendente: true }, { status: 202 });
}
