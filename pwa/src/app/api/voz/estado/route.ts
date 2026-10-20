import { situacaoDaVozIa } from '@/lib/voz-ia';

export const dynamic = 'force-dynamic';

/**
 * Se a voz por IA pode ser usada agora, para a tela decidir entre o fluxo de
 * áudio e o ditado antes de a pessoa tocar no microfone. Não diz nada sobre
 * ninguém e não gasta o teto do dia.
 */
export async function GET() {
  const situacao = await situacaoDaVozIa();
  return Response.json(situacao, { headers: { 'Cache-Control': 'no-store' } });
}
