import { redirect } from "@tanstack/react-router";

import { getSession, type SessionStatus } from "./auth.functions";
import { pode, type Area, type Nivel } from "./permissoes";

/**
 * Guardas de rota executadas no `beforeLoad`.
 *
 * LÓGICA DO LUCIANO: antes a checagem vivia num `useEffect` dentro do
 * `GateShell`, ou seja, o servidor renderizava a página inteira, o navegador
 * baixava tudo, e só então descobria que não havia sessão e redirecionava. O
 * usuário via um piscar de "Carregando…" antes de cair no login.
 *
 * No `beforeLoad` a decisão acontece **antes** da rota carregar, inclusive
 * durante o SSR: quem não tem sessão recebe o redirecionamento direto, sem
 * renderizar nada.
 *
 * Isto continua sendo conveniência de navegação, não segurança. A barreira real
 * é o guard do backend, que rejeita qualquer requisição sem token válido: uma
 * proteção só no front seria contornável abrindo o DevTools.
 */
export async function exigirSessao(): Promise<SessionStatus> {
  const sessao = await getSession();

  if (!sessao.authenticated) {
    throw redirect({ to: "/login" });
  }

  return sessao;
}

/**
 * Além da sessão, exige que o grupo da pessoa libere a área.
 *
 * Sem acesso, volta para as FAQs, que todo grupo abre. O menu já não mostra o
 * item: só chega aqui quem digitou o endereço ou seguiu um link velho.
 */
export async function exigirPermissao(area: Area, nivel: Nivel = "ver"): Promise<SessionStatus> {
  const sessao = await exigirSessao();

  if (!pode(sessao.user, area, nivel)) {
    throw redirect({ to: "/" });
  }

  return sessao;
}

/** Só o master: a tela de grupos muda o acesso de todo mundo. */
export async function exigirMaster(): Promise<SessionStatus> {
  const sessao = await exigirSessao();

  if (!sessao.user?.master) {
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
  // Sem resposta do servidor, a tela de login aparece: é dela a frase que diz
  // o que fazer se entrar também falhar.
  const sessao = await getSession().catch(() => null);

  if (sessao?.authenticated) {
    throw redirect({ to: "/" });
  }
}
