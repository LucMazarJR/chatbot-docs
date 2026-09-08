import { estatisticas } from '@/lib/revisao';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await estatisticas());
}
