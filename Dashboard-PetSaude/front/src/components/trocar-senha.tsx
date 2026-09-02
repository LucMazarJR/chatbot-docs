import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
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
  const [revelar, setRevelar] = useState(false);

  const curta = senhaNova.length > 0 && senhaNova.length < 8;
  // O backend recusa senha igual à atual; avisar aqui evita a ida e volta.
  const igualAAtual = senhaNova.length > 0 && senhaNova === senhaAtual;

  const naoConfere = confirmacao.length > 0 && senhaNova !== confirmacao;
  const podeEnviar =
    senhaAtual.length > 0 &&
    senhaNova.length >= 8 &&
    senhaNova === confirmacao &&
    !igualAAtual &&
    !salvando;

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      await trocar({ data: { currentPassword: senhaAtual, newPassword: senhaNova } });
      // clear() e nao invalidateQueries(): trocar a senha revoga todas as
      // sessoes, entao refazer as queries ativas so renderia 401 e seguraria o
      // redirecionamento. Ver o comentario em components/gate.tsx.
      queryClient.clear();
      toast.success("Senha alterada. Entre novamente com a nova senha.");
      navigate({ to: "/login" });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível alterar a senha");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-lg border border-border panel-surface p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <KeyRound className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Defina sua senha</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua conta está com uma senha provisória, criada por um administrador. Escolha uma senha
            sua para continuar. Você vai entrar de novo com a senha nova.
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={enviar}>
        {/*
          LÓGICA DO LUCIANO: o olho de revelar existe porque esta é a primeira
          tela de todo usuário novo, e ele precisa digitar às cegas uma senha
          provisória que recebeu por WhatsApp ou num papel, e depois a nova duas
          vezes. Três campos mascarados em sequência é a receita para o ciclo
          "senha incorreta" e pedir outra provisória. Vale para os três campos de
          uma vez: quem revela está sozinho na tela, e alternar um a um seria
          três cliques para o mesmo efeito.
        */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRevelar((v) => !v)}
            aria-pressed={revelar}
          >
            {revelar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {revelar ? "Ocultar senhas" : "Mostrar senhas"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha-atual">Senha provisória</Label>
          <Input
            id="senha-atual"
            name="senha-atual"
            type={revelar ? "text" : "password"}
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
            name="senha-nova"
            type={revelar ? "text" : "password"}
            autoComplete="new-password"
            value={senhaNova}
            onChange={(e) => setSenhaNova(e.target.value)}
            required
            minLength={8}
            aria-invalid={curta}
            aria-describedby="ajuda-senha-nova"
          />
          {/* Vira erro quando é violado, em vez de texto de ajuda estático: com
              7 caracteres o botão ficava desabilitado e nada na tela dizia por
              quê. */}
          <p
            id="ajuda-senha-nova"
            className={curta ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
          >
            Ao menos 8 caracteres.
          </p>
          {igualAAtual && (
            <p className="text-xs text-destructive">
              A nova senha precisa ser diferente da provisória.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha-confirmacao">Repita a nova senha</Label>
          <Input
            id="senha-confirmacao"
            name="senha-confirmacao"
            type={revelar ? "text" : "password"}
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
