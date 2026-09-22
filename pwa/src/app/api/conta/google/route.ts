import { CAMINHO_DO_RETORNO, cookieDoFluxo, novoFluxo, origemPublica, urlDeAutorizacao } from '@/lib/conta/google';
import { googleConfigurado } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

/**
 * Começo do login com Google: guarda o estado num cookie e manda para o Google.
 *
 * Entrar e criar conta são o mesmo caminho — quem não tem conta aqui ganha uma
 * na volta. O aceite dos termos está na frase ao lado do botão, e é gravado com
 * a data na conta criada.
 */
export async function GET(requisicao: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleConfigurado() || !clientId) {
    return new Response('Login com Google não configurado.', { status: 404 });
  }

  const origem = origemPublica(requisicao);
  const fluxo = novoFluxo();

  return new Response(null, {
    status: 302,
    headers: {
      Location: urlDeAutorizacao(fluxo, clientId, `${origem}${CAMINHO_DO_RETORNO}`),
      'Set-Cookie': cookieDoFluxo(fluxo, origem.startsWith('https:')),
      'Cache-Control': 'no-store',
    },
  });
}
