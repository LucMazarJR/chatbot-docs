import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";

export type ScriptResumo = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  codeSize: number;
};

export type ScriptAtivo = {
  id: string;
  name: string;
  version: number;
  code: string;
  createdByName: string | null;
  createdAt: string;
};

export type ScriptCompleto = ScriptResumo & { code: string };

/**
 * O script em uso, com o código.
 *
 * Aberto a editor também, e não só a admin: é a tela de importação que precisa
 * do código para rodá-lo no navegador. Não há segredo — é a regra de formato,
 * não credencial.
 */
export const getScriptAtivo = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScriptAtivo> => apiFetch<ScriptAtivo>("/import-scripts/ativo"),
);

export const listScripts = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScriptResumo[]> => apiFetch<ScriptResumo[]>("/import-scripts"),
);

export const getScript = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }): Promise<ScriptCompleto> =>
    apiFetch<ScriptCompleto>(`/import-scripts/${data.id}`),
  );

export const salvarScript = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(3, "Dê um nome a esta versão").max(120),
        // O teto casa com o do DTO no backend. Validar aqui também poupa uma
        // ida à API para receber a mesma recusa.
        code: z
          .string()
          .min(1, "A regra de leitura está vazia")
          .max(262144, "A regra passa de 256 KB"),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }: { data: { name: string; code: string; notes?: string } }) =>
    apiFetch<ScriptResumo>("/import-scripts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );

export const ativarScript = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }: { data: { id: string } }) =>
    apiFetch<ScriptResumo>(`/import-scripts/${data.id}/ativar`, { method: "POST" }),
  );

export const restaurarScriptPadrao = createServerFn({ method: "POST" }).handler(async () =>
  apiFetch<ScriptResumo>("/import-scripts/restaurar-padrao", { method: "POST" }),
);
