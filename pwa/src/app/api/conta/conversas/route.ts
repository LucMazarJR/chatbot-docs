import { conversasDaConta } from '@/lib/conta/conversas';
import { contaDaRequisicao } from '@/lib/conta/sessao';

export const dynamic = 'force-dynamic';

/** O histórico de conversas da conta logada. */
export async function GET(requisicao: Request) {
  const conta = await contaDaRequisicao(requisicao);
  if (!conta) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  return Response.json({ conversas: await conversasDaConta(conta._id) });
}
