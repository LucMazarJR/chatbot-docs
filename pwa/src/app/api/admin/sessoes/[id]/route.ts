import { detalharSessao } from '@/lib/revisao';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const detalhe = await detalharSessao(id);
  if (!detalhe) return Response.json({ erro: 'sessão não encontrada' }, { status: 404 });

  return Response.json(detalhe);
}
