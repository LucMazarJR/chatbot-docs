import { banco } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await (await banco()).command({ ping: 1 });
    return Response.json({ status: 'ok' });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'desconhecido';
    return Response.json({ status: 'sem banco', motivo }, { status: 503 });
  }
}
