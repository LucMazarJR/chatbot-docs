import { despachar } from '@/lib/notificacoes/despachante';

export const dynamic = 'force-dynamic';

/**
 * Dispara uma rodada do despachante por fora.
 *
 * No Docker o relógio interno já faz isto a cada 30 segundos, e esta rota não
 * precisa ser chamada por ninguém. Ela existe para quando o PWA rodar onde não
 * há processo que fique de pé — na Vercel, por exemplo, um cron de lá chamaria
 * aqui.
 *
 * Autentica com o mesmo token da conversa entre n8n e PWA, que já existe nos
 * dois lados: um relógio externo novo não exige segredo novo.
 */
export async function POST(requisicao: Request) {
  const token = process.env.N8N_PWA_WEBHOOK_TOKEN;
  if (!token || requisicao.headers.get('x-webhook-token') !== token) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }

  return Response.json(await despachar());
}
