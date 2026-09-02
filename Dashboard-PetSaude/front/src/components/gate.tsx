import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FolderOpen,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  Stethoscope,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { getSession, logout, type UserRole } from "@/lib/auth.functions";
import { listActivity } from "@/lib/faq.functions";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TrocarSenhaObrigatoria } from "@/components/trocar-senha";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

type Destino = {
  para: "/" | "/categorias" | "/importar" | "/usuarios" | "/configuracoes";
  rotulo: string;
  Icone: typeof ListChecks;
  /** Quem vê. Vazio = todo mundo autenticado. */
  papeis?: UserRole[];
};

const DESTINOS: Destino[] = [
  { para: "/", rotulo: "FAQs", Icone: ListChecks },
  { para: "/categorias", rotulo: "Categorias", Icone: FolderOpen },
  { para: "/importar", rotulo: "Importar", Icone: Upload, papeis: ["admin", "editor"] },
  { para: "/usuarios", rotulo: "Usuarios", Icone: Users, papeis: ["admin"] },
  { para: "/configuracoes", rotulo: "Configuracoes", Icone: Settings, papeis: ["admin"] },
];

function destinosDe(papel: UserRole | undefined): Destino[] {
  if (!papel) return [];
  return DESTINOS.filter((d) => !d.papeis || d.papeis.includes(papel));
}

/**
 * Cabeçalho e moldura de toda página autenticada.
 *
 * LÓGICA DO LUCIANO: a navegação está aqui, e não num route layout, porque não
 * existe um — cada página importa o GateShell e se envolve nele (ver
 * routes/README.md). Antes eram dois botões soltos num `justify-between` sem
 * quebra; com cinco destinos isso não cabia mais em tela nenhuma, e em 360px já
 * não cabia antes. Agora: barra horizontal a partir de `md`, gaveta abaixo
 * disso.
 */
export function GateShell({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sair = useServerFn(logout);
  const { carregando, autenticado, usuario, precisaTrocarSenha } = useSession();
  const [menuAberto, setMenuAberto] = useState(false);

  const destinos = destinosDe(usuario?.role);

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
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
              <Stethoscope className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold leading-tight">
                Central de FAQs
              </span>
              {/* O subtítulo some abaixo de sm: em 360px ele empurrava os botões
                  para fora da tela. */}
              <span className="hidden text-xs text-muted-foreground sm:block">
                PET-SAÚDE · base do chatbot
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            {autenticado && usuario && (
              <>
                <nav className="hidden items-center gap-0.5 md:flex">
                  {destinos.map(({ para, rotulo, Icone }) => (
                    <Button key={para} asChild variant="ghost" size="sm">
                      <Link
                        to={para}
                        activeOptions={{ exact: para === "/" }}
                        activeProps={{ "data-ativo": "true" }}
                        className="data-[ativo=true]:bg-secondary data-[ativo=true]:text-secondary-foreground"
                      >
                        <Icone className="size-4" /> {rotulo}
                      </Link>
                    </Button>
                  ))}
                  <span className="mx-2 hidden text-xs text-muted-foreground lg:inline">
                    {usuario.name}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void encerrarSessao()}>
                    <LogOut className="size-4" />
                    <span className="sr-only">Sair</span>
                  </Button>
                </nav>

                <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                      <Menu className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-72">
                    <SheetHeader>
                      <SheetTitle>{usuario.name}</SheetTitle>
                      <SheetDescription>{ROTULO_PAPEL[usuario.role]}</SheetDescription>
                    </SheetHeader>

                    <nav className="flex flex-col gap-1 px-4">
                      {destinos.map(({ para, rotulo, Icone }) => (
                        <Button
                          key={para}
                          asChild
                          variant="ghost"
                          // h-11: alvo de toque de 44px, o mínimo confortável no
                          // celular. O `size="sm"` padrão dá 32px.
                          className="h-11 justify-start"
                          onClick={() => setMenuAberto(false)}
                        >
                          <Link to={para} activeOptions={{ exact: para === "/" }}>
                            <Icone className="size-4" /> {rotulo}
                          </Link>
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        className="h-11 justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          setMenuAberto(false);
                          void encerrarSessao();
                        }}
                      >
                        <LogOut className="size-4" /> Sair
                      </Button>
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : precisaTrocarSenha ? (
          // Bloqueia o conteudo inteiro: sem isto, a marcacao no banco seria
          // decorativa e a senha escolhida por outra pessoa valeria para sempre.
          <TrocarSenhaObrigatoria />
        ) : (
          children
        )}
      </main>
    </div>
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
