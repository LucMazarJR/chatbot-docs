import { cookies } from 'next/headers';

import { COOKIE_CONTA, contaPeloToken } from './sessao';
import type { Usuario } from './tipos';

/**
 * A conta logada, para páginas renderizadas no servidor.
 *
 * Separado de `sessao.ts` porque `next/headers` só existe dentro de uma
 * renderização do Next — as rotas de API leem o cookie da própria requisição.
 */
export async function contaAtual(): Promise<Usuario | null> {
  return contaPeloToken((await cookies()).get(COOKIE_CONTA)?.value ?? null);
}

/**
 * O login pelo Google está disponível?
 *
 * Sem as duas variáveis o botão simplesmente não aparece, e o e-mail com senha
 * continua funcionando — ligar o Google é só preenchê-las.
 */
export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
