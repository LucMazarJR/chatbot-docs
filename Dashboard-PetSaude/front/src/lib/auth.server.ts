import { useSession } from "@tanstack/react-start/server";

export type AuthSession = {
  accessToken?: string;
  /** Espelhados aqui só para a UI não precisar de uma chamada extra a cada render. */
  userId?: string;
  name?: string;
  email?: string;
  role?: "admin" | "editor" | "leitor";
  mustChangePassword?: boolean;
};

/**
 * Sessão do dashboard: guarda o JWT num cookie httpOnly.
 *
 * O token nunca chega ao JavaScript do navegador — as chamadas à API saem das
 * server functions, que leem o cookie no servidor. É o que impede que um XSS
 * leve o token embora.
 */
function sessionConfig() {
  const password =
    process.env.SESSION_SECRET ||
    "fallback_default_secret_that_must_be_at_least_32_chars_123456789";
  return {
    password,
    name: "petsaude-auth",
    // Alinhado com a validade do JWT (8h): um cookie que sobrevive ao token
    // deixaria a UI achando que está logada e tomando 401 em toda ação.
    maxAge: 60 * 60 * 8,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export function authSession() {
  return useSession<AuthSession>(sessionConfig());
}

/** Token da sessão atual, ou null se não houver. */
export async function getAccessToken(): Promise<string | null> {
  const session = await authSession();
  return session.data.accessToken ?? null;
}
