import { mensagens } from '@/lib/db';
import { TEXTO_INDISPONIVEL } from '@/lib/mensagens-fixas';
import type { TrechoDebug } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * O texto exato que o prompt manda o agente responder quando nenhum trecho
 * serve. Reconhecê-lo é o que permite medir a taxa de "a base não sabia" sem
 * depender de o participante marcar nada.
 */
const RE_NAO_ENCONTREI = /^\s*desculpe\s*[—–-]\s*n[ãa]o encontrei/i;

type Corpo = {
  mensagemId?: string;
  ok?: boolean;
  resposta?: string;
  temContexto?: boolean | null;
  qtdTrechos?: number | null;
  trechosDebug?: TrechoDebug[];
  limiarScore?: number | null;
  modelo?: string | null;
  // Só no fluxo de staging, com reescrita da pergunta.
  perguntaCompleta?: string | null;
  consultas?: unknown;
  reescritaMs?: number | null;
  reescritaFalhou?: boolean;
};

/**
 * Os campos da reescrita, quando o fluxo mandou.
 *
 * Validados aqui porque vão para o banco e para o painel: lista que não é de
 * texto vira lista vazia, e texto grande é cortado. O fluxo do `/` não manda
 * nada disso, e a mensagem dele fica exatamente como era.
 */
function camposDaReescrita(corpo: Corpo): Record<string, unknown> {
  if (corpo.perguntaCompleta === undefined && corpo.consultas === undefined) return {};
  const consultas = Array.isArray(corpo.consultas)
    ? corpo.consultas.filter((c): c is string => typeof c === 'string').map((c) => c.slice(0, 300)).slice(0, 3)
    : [];
  return {
    perguntaCompleta: typeof corpo.perguntaCompleta === 'string' ? corpo.perguntaCompleta.slice(0, 400) : null,
    consultas,
    reescritaMs: typeof corpo.reescritaMs === 'number' ? corpo.reescritaMs : null,
    reescritaFalhou: Boolean(corpo.reescritaFalhou),
  };
}

/**
 * Retorno do n8n: a resposta ficou pronta.
 *
 * O fluxo chama aqui no fim do processamento, quanto tempo quer que ele tenha
 * levado. É o que substituiu a espera na requisição original e tirou o teto de
 * tempo do protótipo.
 *
 * Autenticado pelo mesmo segredo que protege o webhook do n8n: sem isso,
 * qualquer um que descobrisse a URL poderia injetar respostas na conversa de um
 * participante, inclusive orientação de saúde falsa.
 */
export async function POST(requisicao: Request) {
  const token = process.env.N8N_PWA_WEBHOOK_TOKEN;
  if (!token || requisicao.headers.get('x-webhook-token') !== token) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const corpo = (await requisicao.json().catch(() => ({}))) as Corpo;
  const mensagemId = String(corpo.mensagemId ?? '');
  if (!mensagemId) return Response.json({ erro: 'mensagemId ausente' }, { status: 400 });

  const col = await mensagens();

  // Só preenche o que ainda está pendente. Se o n8n repetir a chamada (ele tem
  // retry), a segunda passa direto em vez de sobrescrever a resposta e
  // recalcular a latência a partir de um relógio já parado.
  const pendente = await col.findOne({ _id: mensagemId, pendente: true });
  if (!pendente) return Response.json({ ok: true, jaRegistrada: true });

  const houveFalha = corpo.ok === false;
  const resposta = corpo.resposta || TEXTO_INDISPONIVEL;

  // Vale o TEXTO da resposta, e não a ausência de trechos.
  //
  // Com `temContexto === false` sozinho, toda saudação contaria como lacuna da
  // base: o prompt manda o agente responder "oi", "olá" e "bom dia" sem trecho
  // nenhum, e a resposta está certa. Numa rodada de testes isso deu 8 de 28
  // marcações, ou 29% de ruído no indicador que diz se a base precisa crescer.
  const semResposta = RE_NAO_ENCONTREI.test(resposta);

  await col.updateOne(
    { _id: mensagemId },
    {
      $set: {
        pendente: false,
        texto: resposta,
        // A latência é medida daqui: é o tempo que o participante realmente
        // esperou, da pergunta até a resposta aparecer na tela.
        latenciaMs: Date.now() - new Date(pendente.em).getTime(),
        temContexto: corpo.temContexto ?? null,
        qtdTrechos: corpo.qtdTrechos ?? null,
        trechosDebug: Array.isArray(corpo.trechosDebug) ? corpo.trechosDebug : [],
        limiarScore: corpo.limiarScore ?? null,
        modelo: corpo.modelo ?? null,
        semResposta,
        erro: houveFalha,
        motivoErro: houveFalha ? 'o agente não concluiu' : null,
        ...camposDaReescrita(corpo),
      },
    },
  );

  return Response.json({ ok: true });
}
