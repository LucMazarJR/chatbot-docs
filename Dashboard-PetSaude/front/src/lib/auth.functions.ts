import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";
import { authSession } from "./auth.server";

export type UserRole = "admin" | "editor" | "leitor";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type SessionStatus = {
  authenticated: boolean;
  user: Pick<SessionUser, "id" | "name" | "email" | "role"> | null;
  mustChangePassword: boolean;
};

export const login = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email("Informe um e-mail válido"),
        password: z.string().min(1, "Informe a senha"),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { email: string; password: string } }) => {
    const resposta = await apiFetch<{
      accessToken: string;
      expiresAt: string;
      user: SessionUser;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      auth: false,
    });

    const session = await authSession();
    await session.update({
      accessToken: resposta.accessToken,
      userId: resposta.user.id,
      name: resposta.user.name,
      email: resposta.user.email,
      role: resposta.user.role,
      mustChangePassword: resposta.user.mustChangePassword,
    });

    return { ok: true as const, user: resposta.user };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  // Avisa o backend para revogar a sessão. Se a chamada falhar, o cookie some
  // do mesmo jeito: deixar o usuário preso numa sessão que ele mandou encerrar
  // seria pior do que uma linha órfã na tabela de sessões.
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // silencioso de propósito
  }

  const session = await authSession();
  await session.clear();
  return { ok: true as const };
});

/** Estado da sessão para a UI. Nunca devolve o token. */
export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionStatus> => {
    const session = await authSession();
    if (!session.data.accessToken) {
      return { authenticated: false, user: null, mustChangePassword: false };
    }

    // Confirma no backend em vez de confiar no cookie: se o admin desativou a
    // conta ou trocou o papel, a UI precisa refletir isso agora.
    try {
      const usuario = await apiFetch<SessionUser>("/auth/me");
      return {
        authenticated: true,
        user: {
          id: usuario.id,
          name: usuario.name,
          email: usuario.email,
          role: usuario.role,
        },
        mustChangePassword: usuario.mustChangePassword,
      };
    } catch {
      // Token expirado ou sessão revogada: limpa o cookie para a UI voltar ao
      // login em vez de ficar tentando e tomando 401 em cada ação.
      await session.clear();
      return { authenticated: false, user: null, mustChangePassword: false };
    }
  },
);

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        currentPassword: z.string().min(1, "Informe a senha atual"),
        newPassword: z.string().min(8, "A nova senha precisa ter ao menos 8 caracteres"),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { currentPassword: string; newPassword: string } }) => {
    await apiFetch("/auth/password", { method: "POST", body: JSON.stringify(data) });

    // Trocar a senha revoga as sessões no backend, inclusive esta. Sem limpar o
    // cookie aqui, a próxima ação tomaria 401 sem explicação.
    const session = await authSession();
    await session.clear();
    return { ok: true as const };
  });
