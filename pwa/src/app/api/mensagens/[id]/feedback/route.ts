import { mensagens } from '@/lib/db';
import type { Voto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;
  const corpo = (await requisicao.json().catch(() => ({}))) as { voto?: Voto | null };
  const voto = corpo.voto ?? null;

  if (voto !== 'up' && voto !== 'down' && voto !== null) {
    return Response.json({ erro: 'voto inválido' }, { status: 400 });
  }

  const { matchedCount } = await (await mensagens()).updateOne(
    { _id: id, papel: 'bot' },
    { $set: { feedback: voto, feedbackEm: new Date() } },
  );

  if (!matchedCount) return Response.json({ erro: 'mensagem não encontrada' }, { status: 404 });
  return Response.json({ ok: true });
}
