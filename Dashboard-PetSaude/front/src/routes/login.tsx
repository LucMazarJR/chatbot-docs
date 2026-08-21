import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { login } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { redirecionarSeAutenticado } from "@/lib/guardas";

export const Route = createFileRoute("/login")({
  beforeLoad: () => redirecionarSeAutenticado(),
  head: () => ({
    meta: [{ title: "Entrar | Central de FAQs" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const entrar = useServerFn(login);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    try {
      await entrar({ data: { email, password: senha } });
      // A sessão mudou: o cache guardado é de outra pessoa.
      await queryClient.invalidateQueries();
      toast.success("Bem-vindo!");
      navigate({ to: "/" });
    } catch (erro: any) {
      toast.error(erro?.message ?? "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border panel-surface p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Stethoscope className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Central de FAQs</h1>
            <p className="text-sm text-muted-foreground">Entre com sua conta para continuar</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={enviar}>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Não tem acesso? Peça a um administrador para criar sua conta.
        </p>
      </div>
    </main>
  );
}