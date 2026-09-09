import { listarSessoes } from '@/lib/revisao';
import { lerFiltros } from '../filtros';

export const dynamic = 'force-dynamic';

export async function GET(requisicao: Request) {
  const { filtro, periodo, versao } = lerFiltros(requisicao);
  return Response.json(await listarSessoes(filtro, periodo, versao));
}
