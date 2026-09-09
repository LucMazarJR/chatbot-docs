import { listarSessoes } from '@/lib/revisao';
import type { Filtro } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const FILTROS: Filtro[] = ['validas', 'todas', 'negativos', 'nota-baixa', 'sem-resposta'];

export async function GET(requisicao: Request) {
  const pedido = new URL(requisicao.url).searchParams.get('filtro') as Filtro;
  // Filtro desconhecido cai em 'validas', não em 'todas': o padrão nunca deve
  // ser o que mostra as visitas vazias.
  const filtro = FILTROS.includes(pedido) ? pedido : 'validas';

  return Response.json(await listarSessoes(filtro));
}
