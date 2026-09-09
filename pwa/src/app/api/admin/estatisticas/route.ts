import { estatisticas } from '@/lib/revisao';
import { lerFiltros } from '../filtros';

export const dynamic = 'force-dynamic';

export async function GET(requisicao: Request) {
  // O `filtro` de situação não entra aqui de propósito: os números do topo
  // descrevem o recorte (período e interface), não a lista filtrada. Se
  // mudassem junto, "3 conversas com 👎" viraria "100% com 👎".
  const { periodo, versao } = lerFiltros(requisicao);
  return Response.json(await estatisticas(periodo, versao));
}
