import { chavesVapid } from '@/lib/push/vapid';

export const dynamic = 'force-dynamic';

/**
 * A chave pública VAPID, que o navegador precisa para se inscrever.
 *
 * Pública de verdade — é ela que o serviço de push usa para conferir que os
 * avisos vêm deste servidor —, então não pede login. Servida por rota, e não
 * embutida no build, porque mora no banco.
 */
export async function GET() {
  const chaves = await chavesVapid();
  return Response.json({ chavePublica: chaves.publica });
}
