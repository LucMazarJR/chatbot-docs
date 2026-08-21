import { redirect } from "@tanstack/react-router";

import { getSession, type SessionStatus } from "./auth.functions";

/**
 * Guardas de rota executadas no `beforeLoad`.
 *
 * LÓGICA DO LUCIANO: antes a checagem vivia num `useEffect` dentro do
 * `GateShell` — ou seja, o servidor renderizava a página inteira, o navegador
 * baixava tudo, e só então descobria que não havia sessão e redirecionava. O
 * usuário via um piscar de "Carregando…" antes de cair no login.
 *
 * No `beforeLoad` a decisão acontece **antes** da rota carregar, inclusive
 * durante o SSR: quem não tem sessão recebe o redirecionamento direto, sem
 * renderizar nada.
 *
 * Isto continua sendo conveniência de navegação, não segurança. A barreira real
 * é o guard do backend, que rejeita qualquer requisição sem token válido — uma
 * proteção só no front seria contornável abrindo o DevTools.
 */
export async function exigirSessao(): Promise<SessionStatus> {
  const sessao = await getSession();

  if (!sessao.authenticated) {
    throw redirect({ to: "/login" });
  }

  return sessao;
}

/** Além da sessão, exige o papel de administrador. */
export async function exigirAdmin(): Promise<SessionStatus> {
  const sessao = await exigirSessao();

  if (sessao.user?.role !== "admin") {
    throw redirect({ to: "/" });
  }

  return sessao;
}

/**
 * Usada na tela de login: quem já está autenticado não deveria vê-la.
 *
 * Sem isto, voltar para /login com sessão ativa mostra o formulário como se a
 * pessoa estivesse deslogada.
 */
export async function redirecionarSeAutenticado(): Promise<void> {
  const sessao = await getSession();

  if (sessao.authenticated) {
    throw redirect({ to: "/" });
  }
}
