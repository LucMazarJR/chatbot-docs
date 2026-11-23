import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";
import { AREAS, type Permissoes } from "./permissoes";

export type Grupo = {
  id: string;
  nome: string;
  descricao: string;
  permissoes: Permissoes;
  /** Contas ativas no grupo. */
  membros: number;
  /** Desativadas continuam presas ao grupo: impedem apagar. */
  desativadas: number;
};

// O back confere área por área e devolve a frase de cada erro; aqui só se
// garante o formato, para não mandar lixo.
const permissoes = z.record(z.enum(AREAS), z.enum(["ver", "editar", "nada"]));

const dadosDoGrupo = z.object({
  nome: z.string().trim().min(2, "O nome do grupo precisa de ao menos 2 letras").max(60),
  descricao: z.string().trim().max(200).default(""),
  permissoes,
});

type DadosDoGrupo = z.infer<typeof dadosDoGrupo>;

export const listarGrupos = createServerFn({ method: "GET" }).handler(async (): Promise<Grupo[]> =>
  apiFetch<Grupo[]>("/grupos"),
);

export const criarGrupo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => dadosDoGrupo.parse(data))
  .handler(async ({ data }: { data: DadosDoGrupo }) =>
    apiFetch<Grupo>("/grupos", { method: "POST", body: JSON.stringify(data) }),
  );

export const atualizarGrupo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => dadosDoGrupo.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }: { data: DadosDoGrupo & { id: string } }) => {
    const { id, ...campos } = data;
    return apiFetch<Grupo>(`/grupos/${id}`, { method: "PUT", body: JSON.stringify(campos) });
  });

export const apagarGrupo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }: { data: { id: string } }) =>
    apiFetch<{ ok: true }>(`/grupos/${data.id}`, { method: "DELETE" }),
  );
