import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { apiFetch } from "./api.server";

/**
 * Avisos push para quem tem conta no chat de testes (/staging do PWA).
 *
 * O painel só agenda: grava na fila do PWA, e quem envia é o despachante de lá.
 * Todas as rotas exigem papel admin no backend.
 */

export const TIPOS_DA_EQUIPE = ["lembrete-exame", "lembrete-consulta", "aviso"] as const;

export type TipoDaEquipe = (typeof TIPOS_DA_EQUIPE)[number];

export type EstadoAviso = "pendente" | "enviando" | "enviada" | "expirada" | "falhou" | "cancelada";

/**
 * Nome e texto da tela bloqueada de cada tipo, para a prévia do formulário.
 *
 * Espelho de `TIPOS` em pwa/src/lib/notificacoes/tipos.ts, que é quem de fato
 * monta a notificação. Mudar um texto lá exige mudar aqui.
 */
export const TIPOS: Record<
  TipoDaEquipe,
  { rotulo: string; descricao: string; titulo: string; corpo: string }
> = {
  "lembrete-exame": {
    rotulo: "Lembrete de exame",
    descricao: "Coleta, imagem, preparo.",
    titulo: "Você tem um lembrete",
    corpo: "Toque para ver os detalhes.",
  },
  "lembrete-consulta": {
    rotulo: "Lembrete de consulta",
    descricao: "Consulta marcada, retorno.",
    titulo: "Você tem um lembrete",
    corpo: "Toque para ver os detalhes.",
  },
  aviso: {
    rotulo: "Aviso da equipe",
    descricao: "Campanha, mudança de horário, recado geral.",
    titulo: "Novo aviso da equipe de saúde",
    corpo: "Toque para ler.",
  },
};

export const DETALHE_MAXIMO = 1000;

export type Destinatario = {
  id: string;
  email: string;
  nome: string | null;
  aparelhos: number;
  plataformas: string[];
  ultimoSucessoEm: string | null;
};

export type Envio = {
  loteId: string;
  tipo: string;
  rotulo: string;
  detalhe: string;
  mostrarDetalhe: boolean;
  criadaPor: string;
  criadaEm: string;
  enviarEm: string;
  validaAte: string;
  total: number;
  estados: Record<EstadoAviso, number>;
  exibidas: number;
  abertas: number;
};

export type ResumoDePlataforma = {
  plataforma: string;
  aparelhos: number;
  aceitas: number;
  exibidas: number;
  abertas: number;
  inscricoesMortas: number;
  falhas: number;
};

export type PessoaDoEnvio = {
  email: string;
  nome: string | null;
  estado: EstadoAviso;
  motivo: string | null;
  tentativas: number;
  enviadaEm: string | null;
  exibidaEm: string | null;
  abertaEm: string | null;
};

export const listarDestinatarios = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ contas: Destinatario[]; contasSemAparelho: number }> =>
    apiFetch("/notificacoes/destinatarios"),
);

export const listarEnvios = createServerFn({ method: "GET" }).handler(async (): Promise<Envio[]> =>
  apiFetch("/notificacoes"),
);

export const detalharEnvio = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ loteId: z.string().min(1).max(64) }).parse(data))
  .handler(
    async ({
      data,
    }): Promise<{ loteId: string; plataformas: ResumoDePlataforma[]; pessoas: PessoaDoEnvio[] }> =>
      apiFetch(`/notificacoes/${encodeURIComponent(data.loteId)}`),
  );

const novoAviso = z.object({
  tipo: z.enum(TIPOS_DA_EQUIPE),
  detalhe: z.string().max(DETALHE_MAXIMO),
  mostrarDetalhe: z.boolean(),
  todos: z.boolean(),
  destinatarios: z.array(z.string().max(64)).max(5000),
  // Instantes ISO já convertidos no navegador: o horário que a pessoa digitou
  // está no fuso dela, e o servidor do front pode estar em outro.
  enviarEm: z.string().datetime().optional(),
  validaAte: z.string().datetime(),
});

export type NovoAviso = z.infer<typeof novoAviso>;

export const agendarAviso = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => novoAviso.parse(data))
  .handler(
    async ({
      data,
    }: {
      data: NovoAviso;
    }): Promise<{ loteId: string; criadas: number; ignorados: number }> =>
      apiFetch("/notificacoes", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          // O backend recusa receber os dois ao mesmo tempo.
          destinatarios: data.todos ? undefined : data.destinatarios,
        }),
      }),
  );

export const cancelarEnvio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ loteId: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ data }: { data: { loteId: string } }): Promise<{ canceladas: number }> =>
    apiFetch(`/notificacoes/${encodeURIComponent(data.loteId)}/cancelar`, { method: "POST" }),
  );
