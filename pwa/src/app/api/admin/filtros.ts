import type { Filtro, FiltroVersao, Periodo } from '@/lib/tipos';

/**
 * Lê os filtros da querystring, com o mesmo padrão nas duas rotas da revisão.
 *
 * As listas de valores aceitos ficam aqui e não em cada rota porque os dois
 * endpoints precisam concordar: se a lista mostrasse um recorte e os números do
 * topo outro, a tela mentiria sem dar nenhum sinal.
 */
const FILTROS: Filtro[] = [
  'validas',
  'todas',
  'negativos',
  'nota-baixa',
  'sem-resposta',
  'com-erro',
];
const PERIODOS: Periodo[] = ['hoje', '7d', '30d', 'tudo'];
const VERSOES: FiltroVersao[] = ['a', 'b', 'todas'];

export function lerFiltros(requisicao: Request) {
  const params = new URL(requisicao.url).searchParams;

  const filtro = params.get('filtro') as Filtro;
  const periodo = params.get('periodo') as Periodo;
  const versao = params.get('versao') as FiltroVersao;

  return {
    // Valor desconhecido cai em 'validas', nunca em 'todas': o padrão não deve
    // ser o que mostra as visitas vazias.
    filtro: FILTROS.includes(filtro) ? filtro : 'validas',
    periodo: PERIODOS.includes(periodo) ? periodo : 'tudo',
    versao: VERSOES.includes(versao) ? versao : 'todas',
  };
}
