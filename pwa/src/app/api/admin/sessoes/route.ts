import { listarSessoes } from '@/lib/revisao';
import type { Filtro } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const FILTROS: Filtro[] = ['negativos', 'nota-baixa', 'sem-resposta'];

export async function GET(requisicao: Request) {
  const pedido = new URL(requisicao.url).searchParams.get('filtro') as Filtro;
  const filtro = FILTROS.includes(pedido) ? pedido : null;

  return Response.json(await listarSessoes(filtro));
}
