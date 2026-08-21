import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Stethoscope, Users } from "lucide-react";
import { toast } from "sonner";

import { getSession, logout, type UserRole } from "@/lib/auth.functions";
import { listActivity } from "@/lib/faq.functions";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TrocarSenhaObrigatoria } from "@/components/trocar-senha";

const ROTULO_PAPEL: Record<UserRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  leitor: "Leitor",
};

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

export function GateShell({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sair = useServerFn(logout);
  const { carregando, autenticado, usuario, precisaTrocarSenha } = useSession();

  // Quem não tem sessão nem chega aqui: o `beforeLoad` da rota redireciona
  // antes de renderizar (ver lib/guardas.ts). Este componente cuida só do
  // cabeçalho e da troca de senha obrigatória.

  return (
    <main className="min-h-screen bg-background">
      <Toaster position="top-center" />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Stethoscope className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">Central de FAQs</h1>
              <p className="text-xs text-muted-foreground">
                Consultar, inserir, editar e excluir perguntas frequentes
              </p>
            </div>
          </Link>

          {autenticado && usuario && (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {usuario.name}
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  {ROTULO_PAPEL[usuario.role]}
                </span>
              </span>

              {usuario.role === "admin" && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/usuarios">
                    <Users className="size-4" /> Usuários
                  </Link>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await sair({});
                  await queryClient.invalidateQueries();
                  toast.success("Sessão encerrada");
                  navigate({ to: "/login" });
                }}
              >
                <LogOut className="size-4" /> Sair
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
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
    </main>
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
    <section className="rounded-2xl border border-border panel-surface p-6">
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
