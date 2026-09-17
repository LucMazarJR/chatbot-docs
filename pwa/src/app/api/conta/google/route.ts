import { CAMINHO_DO_RETORNO, cookieDoFluxo, novoFluxo, origemPublica, urlDeAutorizacao } from '@/lib/conta/google';
import { googleConfigurado } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

/**
 * Começo do login com Google: guarda o estado num cookie e manda para o Google.
 *
 * `?aceite=1` vem da aba "Criar conta", com a caixa dos termos marcada. É o que
 * autoriza o retorno a criar uma conta nova; sem ele, o retorno só entra em
 * conta que já existe.
 */
export async function GET(requisicao: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleConfigurado() || !clientId) {
    return new Response('Login com Google não configurado.', { status: 404 });
  }

  const origem = origemPublica(requisicao);
  const fluxo = novoFluxo(new URL(requisicao.url).searchParams.get('aceite') === '1');

  return new Response(null, {
    status: 302,
    headers: {
      Location: urlDeAutorizacao(fluxo, clientId, `${origem}${CAMINHO_DO_RETORNO}`),
      'Set-Cookie': cookieDoFluxo(fluxo, origem.startsWith('https:')),
      'Cache-Control': 'no-store',
    },
  });
}
