import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Lock, LogOut, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { getGateStatus, listActivity, lockDashboard, unlockDashboard } from "@/lib/faq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

export function GateShell({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const gate = useQuery({ queryKey: ["gate"], queryFn: () => getGateStatus() });
  const unlocked = gate.data?.unlocked ?? false;
  const actorName = gate.data?.name ?? null;

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
          {unlocked ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Conectado como <strong className="text-foreground">{actorName}</strong>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await lockDashboard();
                  await queryClient.invalidateQueries();
                  toast.success("Sessão encerrada");
                }}
              >
                <LogOut className="size-4" /> Sair
              </Button>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Bloqueado
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {gate.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : unlocked ? (
          children
        ) : (
          <IdentifyCard />
        )}
      </div>
    </main>
  );
}

function IdentifyCard() {
  const queryClient = useQueryClient();
  const unlock = useServerFn(unlockDashboard);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await unlock({ data: { name, password } });
      if (result.ok) {
        await queryClient.invalidateQueries();
        toast.success(`Bem-vindo(a), ${name.trim()}`);
        return;
      }
      setError(
        result.reason === "not_configured"
          ? "A senha de acesso ainda não foi configurada no projeto."
          : "Senha incorreta.",
      );
    } catch (err) {
      console.error("[Login catch Exception]:", err);
      setError("Não foi possível validar a senha. Tente novamente.");
    } finally {
      setPending(false);
      setPassword("");
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border panel-surface p-8">
      <h2 className="text-xl font-semibold">Identifique-se</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Informe seu nome e a senha da equipe. Seu nome fica registrado em cada alteração.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Seu nome</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Dra. Ana Souza"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha de acesso</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          className="w-full"
          disabled={pending || password.length === 0 || name.trim().length < 2}
        >
          {pending ? "Verificando…" : "Entrar no painel"}
        </Button>
      </form>
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
