import { exportarCsv, exportarJson } from '@/lib/revisao';

export const dynamic = 'force-dynamic';

export async function GET(requisicao: Request) {
  const formato = new URL(requisicao.url).searchParams.get('formato') === 'json' ? 'json' : 'csv';
  const nome = `prototipo-pwa-${new Date().toISOString().slice(0, 10)}.${formato}`;
  const anexo = `attachment; filename="${nome}"`;

  if (formato === 'json') {
    return Response.json(await exportarJson(), { headers: { 'Content-Disposition': anexo } });
  }

  return new Response(await exportarCsv(), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': anexo },
  });
}
