import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { changePassword } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Troca obrigatória de senha.
 *
 * Aparece no lugar do conteúdo quando a conta está com senha provisória —
 * aquela que um administrador digitou por você. Sem esta tela, a marcação
 * `must_change_password` seria só um campo bonito no banco: a senha que outra
 * pessoa escolheu continuaria valendo indefinidamente.
 *
 * Trocar a senha revoga todas as sessões no backend, inclusive esta, então o
 * caminho natural depois de salvar é voltar ao login.
 */
export function TrocarSenhaObrigatoria() {
  const trocar = useServerFn(changePassword);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const naoConfere = confirmacao.length > 0 && senhaNova !== confirmacao;
  const podeEnviar =
    senhaAtual.length > 0 && senhaNova.length >= 8 && senhaNova === confirmacao && !salvando;

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      await trocar({ data: { currentPassword: senhaAtual, newPassword: senhaNova } });
      await queryClient.invalidateQueries();
      toast.success("Senha alterada. Entre novamente com a nova senha.");
      navigate({ to: "/login" });
    } catch (erro: any) {
      toast.error(erro?.message ?? "Não foi possível alterar a senha");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-2xl border border-border panel-surface p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <KeyRound className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Defina sua senha</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua conta está com uma senha provisória, criada por um administrador. Escolha
            uma senha sua para continuar.
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={enviar}>
        <div className="space-y-2">
          <Label htmlFor="senha-atual">Senha provisória</Label>
          <Input
            id="senha-atual"
            type="password"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha-nova">Nova senha</Label>
          <Input
            id="senha-nova"
            type="password"
            autoComplete="new-password"
            value={senhaNova}
            onChange={(e) => setSenhaNova(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">Ao menos 8 caracteres.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha-confirmacao">Repita a nova senha</Label>
          <Input
            id="senha-confirmacao"
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            required
          />
          {naoConfere && <p className="text-xs text-destructive">As senhas não conferem.</p>}
        </div>

        <Button type="submit" className="w-full" disabled={!podeEnviar}>
          {salvando ? "Salvando…" : "Salvar e entrar novamente"}
        </Button>
      </form>
    </div>
  );
}
