import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { getSession, logout } from "@/lib/auth.functions";
import { barraAbertaGuardada } from "@/lib/preferencia-barra";
import { listActivity } from "@/lib/faq.functions";
import { Toaster } from "@/components/ui/sonner";
import { TrocarSenhaObrigatoria } from "@/components/trocar-senha";
import { BarraLateral, IrPara } from "@/components/barra-lateral";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Estado da sessão para os componentes.
 *
 * Uma única query compartilhada (`["session"]`) em vez de cada tela consultar
 * por conta própria — o react-query dedupe, então a checagem custa uma
 * requisição por sessão, não uma por componente.
 */
export function useSession() {
  const query = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  return {
    carregando: query.isLoading,
    autenticado: query.data?.authenticated ?? false,
    usuario: query.data?.user ?? null,
    precisaTrocarSenha: query.data?.mustChangePassword ?? false,
  };
}

/** True quando o papel permite criar, editar e excluir FAQs. */
export function usePodeEscrever() {
  const { usuario } = useSession();
  return usuario?.role === "admin" || usuario?.role === "editor";
}

/**
 * Moldura de toda página autenticada: barra lateral, barra do topo e conteúdo.
 *
 * LÓGICA DO LUCIANO: a navegação está aqui, e não num route layout, porque não
 * existe um — cada página importa o GateShell e se envolve nele (ver
 * routes/README.md). Por isso trocar a moldura troca a navegação de todas as
 * telas de uma vez, sem editar nenhuma rota.
 *
 * Era uma barra horizontal com oito destinos, já no limite da largura, e cada
 * funcionalidade nova piorava. Virou barra lateral agrupada por área, que
 * recolhe para ícones no desktop e vira gaveta no celular, e os destinos moram
 * em `lib/navegacao.ts`.
 */
export function GateShell({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sair = useServerFn(logout);
  const { carregando, autenticado, usuario, precisaTrocarSenha } = useSession();

  // O componente da barra grava a escolha num cookie, mas não a relê ao carregar.
  const [barraAberta, setBarraAberta] = useState(barraAbertaGuardada);

  /**
   * Encerra a sessão e leva para o login.
   *
   * LÓGICA DO LUCIANO: aqui havia `await queryClient.invalidateQueries()` entre
   * o logout e o `navigate`, e era o motivo de sair não funcionar.
   *
   * `invalidateQueries()` sem argumento não marca como obsoleto: ele refaz toda
   * query ativa e devolve uma promessa que só resolve quando TODAS terminarem.
   * Como o cookie acabou de ser apagado, todas passam a responder 401, cada uma
   * com as retentativas do cliente. O `await` segurava o redirecionamento por
   * vários segundos, e nesse meio-tempo a tela ficava num estado sem sentido: a
   * query da sessão resolve na hora (sem token ela nem chama o backend), então o
   * menu inteiro sumia e o conteúdo da página continuava lá. Parecia que sair
   * não tinha feito nada, e recarregar "resolvia" porque aí a guarda da rota
   * roda no servidor.
   *
   * Agora: descarta o cache sem refazer nada, e navega. `clear()` é síncrono e
   * remove tudo, que é exatamente o que se quer ao trocar de identidade.
   */
  const encerrarSessao = async () => {
    await sair({});
    queryClient.clear();
    toast.success("Sessão encerrada");
    navigate({ to: "/login" });
  };

  // Quem não tem sessão nem chega aqui: o `beforeLoad` da rota redireciona
  // antes de renderizar (ver lib/guardas.ts).

  return (
    <SidebarProvider open={barraAberta} onOpenChange={setBarraAberta}>
      <Toaster position="top-center" />

      {autenticado && usuario && (
        <BarraLateral usuario={usuario} onSair={() => void encerrarSessao()} />
      )}

      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-4">
          {autenticado && usuario && (
            <>
              {/* 44px: alvo de toque confortável; o padrão do componente é 28px. */}
              <SidebarTrigger className="size-11" />
              <span className="truncate text-sm font-semibold md:hidden">Central de FAQs</span>
              <IrPara papel={usuario.role} />
            </>
          )}
        </header>

        {/* `div`, e não `main`: o SidebarInset já é o <main> da página. */}
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : precisaTrocarSenha ? (
            // Bloqueia o conteudo inteiro: sem isto, a marcacao no banco seria
            // decorativa e a senha escolhida por outra pessoa valeria para sempre.
            <TrocarSenhaObrigatoria />
          ) : (
            children
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function ActivityFeed() {
  const activity = useQuery({
    queryKey: ["activity", { limit: 15 }],
    queryFn: () => listActivity({ data: { page: 1, limit: 15 } }),
  });
  const items = activity.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-border panel-surface p-4 sm:p-6">
      <h2 className="text-base font-semibold">Histórico de alterações</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <strong className="text-foreground">{item.actor_name}</strong>
            <span className="text-muted-foreground">
              {item.action === "inserir"
                ? "inseriu"
                : item.action === "editar"
                  ? "editou"
                  : "excluiu"}
            </span>
            <span className="min-w-0 truncate text-foreground/80">“{item.question}”</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString("pt-BR")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
