import { randomUUID } from 'node:crypto';

import { sessoes } from '@/lib/db';
import type { Sessao } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const LIMITE_NOME = 60;

export async function POST(requisicao: Request) {
  const corpo = (await requisicao.json().catch(() => ({}))) as { nome?: string };
  const nome = String(corpo.nome ?? '').trim().slice(0, LIMITE_NOME);

  const sessao: Sessao = {
    _id: randomUUID(),
    nome: nome || 'Participante',
    iniciadaEm: new Date(),
    encerradaEm: null,
    userAgent: (requisicao.headers.get('user-agent') ?? '').slice(0, 300),
    avaliacao: null,
  };

  await (await sessoes()).insertOne(sessao);

  return Response.json({ sessaoId: sessao._id, nome: sessao.nome }, { status: 201 });
}
