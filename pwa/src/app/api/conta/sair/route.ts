import {
  cookieQueEncerra,
  encerrarSessaoDeConta,
  origemConfiavel,
  tokenDoCookie,
} from '@/lib/conta/sessao';

export const dynamic = 'force-dynamic';

/**
 * Encerra a sessão DESTE aparelho.
 *
 * Apagar só o cookie deixaria o token válido no banco por 30 dias: quem tivesse
 * copiado o cookie continuaria entrando. A sessão sai do banco primeiro.
 */
export async function POST(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  await encerrarSessaoDeConta(tokenDoCookie(requisicao.headers.get('cookie')));

  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookieQueEncerra(requisicao) } });
}
