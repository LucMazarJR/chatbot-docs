import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  const [revelar, setRevelar] = useState(false);
  const [esqueceu, setEsqueceu] = useState(false);

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    try {
      await entrar({ data: { email, password: senha } });
      // A sessão mudou: o cache guardado é de outra pessoa. clear() descarta
      // sem refazer, e as queries da próxima tela buscam sozinhas ao montar.
      queryClient.clear();
      toast.success("Bem-vindo!");
      navigate({ to: "/" });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/logo-pet-saude.png"
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-full bg-white ring-1 ring-border"
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Central de FAQs</h1>
            <p className="text-[15px] text-muted-foreground">
              PET-Saúde. Entre com a sua conta da equipe.
            </p>
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="senha">Senha</Label>
              {/* Errar uma letra de uma senha mascarada parece "esqueci a senha". */}
              <Button
                type="button"
                variant="ghost"
                className="-mr-2 px-3"
                onClick={() => setRevelar((v) => !v)}
                aria-pressed={revelar}
                aria-controls="senha"
              >
                {revelar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {revelar ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
            <Input
              id="senha"
              type={revelar ? "text" : "password"}
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

        {/*
          LÓGICA DO LUCIANO: não existe envio de e-mail no projeto, então não há
          redefinição automática. Mas quem esqueceu a senha precisa saber o que
          fazer sem ter de perguntar a ninguém como perguntar: antes a tela só
          falava de criar conta. Os nomes dos administradores não aparecem aqui
          de propósito: esta página é pública, e listar quem tem acesso total
          seria entregar os alvos.
        */}
        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <button
            type="button"
            className="min-h-11 rounded-md px-2 font-semibold text-primary underline-offset-4 hover:underline"
            aria-expanded={esqueceu}
            aria-controls="ajuda-senha"
            onClick={() => setEsqueceu((v) => !v)}
          >
            Esqueci minha senha
          </button>
          {esqueceu && (
            <p id="ajuda-senha" className="rounded-lg bg-muted p-3 text-left text-foreground">
              Peça a um administrador do painel para redefinir sua senha. Ele cria uma senha
              provisória, e no primeiro acesso você escolhe a sua. Quando o navegador perguntar,
              deixe ele salvar a senha nova.
            </p>
          )}
          <p>Não tem acesso? Peça a um administrador para criar sua conta.</p>
        </div>
      </div>
    </main>
  );
}
