import { mensagens } from '@/lib/db';
import { etapaValida } from '@/lib/etapas-da-resposta';

export const dynamic = 'force-dynamic';

/**
 * O fluxo do staging avisa em que etapa a resposta está: lendo a pergunta,
 * procurando na base ou escrevendo.
 *
 * Só marca a mensagem que ainda está pendente: um aviso atrasado, que chegue
 * depois da resposta, não pode reabrir nada. Mesmo segredo do retorno da
 * resposta, porque também escreve na conversa de alguém.
 */
export async function POST(requisicao: Request) {
  const token = process.env.N8N_PWA_WEBHOOK_TOKEN;
  if (!token || requisicao.headers.get('x-webhook-token') !== token) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const corpo = (await requisicao.json().catch(() => ({}))) as { mensagemId?: unknown; etapa?: unknown };
  const mensagemId = typeof corpo.mensagemId === 'string' ? corpo.mensagemId : '';
  const etapa = etapaValida(corpo.etapa);
  if (!mensagemId || !etapa) return Response.json({ erro: 'mensagemId ou etapa inválidos' }, { status: 400 });

  await (await mensagens()).updateOne({ _id: mensagemId, pendente: true }, { $set: { etapa } });
  return Response.json({ ok: true });
}
