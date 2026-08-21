import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";
import type { SessionUser, UserRole } from "./auth.functions";

const papeis = z.enum(["admin", "editor", "leitor"]);

export const listUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser[]> => apiFetch<SessionUser[]>("/users"),
);

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "Informe o nome").max(120),
        email: z.string().trim().email("Informe um e-mail válido"),
        password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
        role: papeis.default("leitor"),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { name: string; email: string; password: string; role: UserRole } }) =>
    apiFetch<SessionUser>("/users", { method: "POST", body: JSON.stringify(data) }),
  );

export const updateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().min(1),
        name: z.string().trim().min(2).max(120).optional(),
        email: z.string().trim().email().optional(),
        role: papeis.optional(),
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: any }) => {
    const { id, ...campos } = data;
    return apiFetch<SessionUser>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(campos),
    });
  });

export const setUserPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().min(1),
        newPassword: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { id: string; newPassword: string } }) =>
    apiFetch<{ ok: true }>(`/users/${data.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword: data.newPassword }),
    }),
  );

export const deactivateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }) =>
    apiFetch<SessionUser>(`/users/${data.id}/deactivate`, { method: "PATCH" }),
  );
