import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { GateShell, useSession } from "@/components/gate";
import {
  createUser,
  deactivateUser,
  listUsers,
  setUserPassword,
  updateUser,
} from "@/lib/users.functions";
import type { UserRole } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exigirAdmin } from "@/lib/guardas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAPEIS: { valor: UserRole; rotulo: string; descricao: string }[] = [
  { valor: "admin", rotulo: "Administrador", descricao: "Gerencia usuários e FAQs" },
  { valor: "editor", rotulo: "Editor", descricao: "Cria e edita FAQs" },
  { valor: "leitor", rotulo: "Leitor", descricao: "Apenas consulta" },
];

export const Route = createFileRoute("/usuarios")({
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "Usuários | Central de FAQs" }] }),
  component: UsuariosPage,
});

function UsuariosPage() {
  return (
    <GateShell>
      <PainelUsuarios />
    </GateShell>
  );
}

function PainelUsuarios() {
  const { usuario } = useSession();
  const queryClient = useQueryClient();

  const usuariosQuery = useQuery({ queryKey: ["users"], queryFn: () => listUsers() });

  const criar = useServerFn(createUser);
  const atualizar = useServerFn(updateUser);
  const desativar = useServerFn(deactivateUser);
  const definirSenha = useServerFn(setUserPassword);

  const aoConcluir = (mensagem: string) => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
    toast.success(mensagem);
  };

  const mutCriar = useMutation({
    mutationFn: (dados: any) => criar({ data: dados }),
    onSuccess: () => aoConcluir("Usuário criado"),
    onError: (erro: any) => toast.error(erro?.message ?? "Não foi possível criar"),
  });

  const mutAtualizar = useMutation({
    mutationFn: (dados: any) => atualizar({ data: dados }),
    onSuccess: () => aoConcluir("Usuário atualizado"),
    onError: (erro: any) => toast.error(erro?.message ?? "Não foi possível atualizar"),
  });

  const mutDesativar = useMutation({
    mutationFn: (id: string) => desativar({ data: { id } }),
    onSuccess: () => aoConcluir("Usuário desativado"),
    onError: (erro: any) => toast.error(erro?.message ?? "Não foi possível desativar"),
  });

  const mutSenha = useMutation({
    mutationFn: (dados: { id: string; newPassword: string }) => definirSenha({ data: dados }),
    onSuccess: () => aoConcluir("Senha redefinida. O usuário precisará trocá-la ao entrar."),
    onError: (erro: any) => toast.error(erro?.message ?? "Não foi possível redefinir"),
  });

  // A tela só existe para admin, mas o backend é quem garante: a rota inteira
  // é anotada com Roles('admin'). Isto aqui evita mostrar uma página que só
  // devolveria 403.
  if (usuario && usuario.role !== "admin") {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Somente administradores podem gerenciar usuários.
      </p>
    );
  }

  const usuarios = usuariosQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Usuários</h2>
        <p className="text-sm text-muted-foreground">
          {usuarios.length} {usuarios.length === 1 ? "conta" : "contas"} cadastradas
        </p>
      </div>

      <FormularioNovoUsuario
        aoCriar={(dados) => mutCriar.mutate(dados)}
        salvando={mutCriar.isPending}
      />

      {usuariosQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando usuários…</p>
      ) : (
        <ul className="space-y-3">
          {usuarios.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border panel-surface p-5"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {u.name}
                  {u.id === usuario?.id && (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      você
                    </span>
                  )}
                  {!u.isActive && (
                    <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
                      desativado
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>

              <Select
                value={u.role}
                onValueChange={(papel) => mutAtualizar.mutate({ id: u.id, role: papel })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS.map((p) => (
                    <SelectItem key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <BotaoRedefinirSenha
                aoDefinir={(senha) => mutSenha.mutate({ id: u.id, newPassword: senha })}
              />

              {u.isActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => mutDesativar.mutate(u.id)}
                  disabled={mutDesativar.isPending}
                >
                  Desativar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => mutAtualizar.mutate({ id: u.id, isActive: true })}
                >
                  <ShieldCheck className="size-4" /> Reativar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormularioNovoUsuario({
  aoCriar,
  salvando,
}: {
  aoCriar: (dados: { name: string; email: string; password: string; role: UserRole }) => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<UserRole>("leitor");

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    aoCriar({ name: nome, email, password: senha, role: papel });
    setNome("");
    setEmail("");
    setSenha("");
    setPapel("leitor");
  };

  return (
    <form
      onSubmit={enviar}
      className="grid gap-3 rounded-2xl border border-border panel-surface p-5 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <UserPlus className="size-4" /> Novo usuário
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A senha definida aqui é provisória: a troca será exigida no primeiro acesso.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="novo-nome">Nome</Label>
        <Input
          id="novo-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          minLength={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="novo-email">E-mail</Label>
        <Input
          id="novo-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nova-senha">Senha provisória</Label>
        <Input
          id="nova-senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label>Papel</Label>
        <Select value={papel} onValueChange={(v) => setPapel(v as UserRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAPEIS.map((p) => (
              <SelectItem key={p.valor} value={p.valor}>
                {p.rotulo} — {p.descricao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Criando…" : "Criar usuário"}
        </Button>
      </div>
    </form>
  );
}

function BotaoRedefinirSenha({ aoDefinir }: { aoDefinir: (senha: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");

  if (!aberto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <KeyRound className="size-4" /> Senha
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Nova senha"
        className="w-40"
        minLength={8}
      />
      <Button
        size="sm"
        disabled={senha.length < 8}
        onClick={() => {
          aoDefinir(senha);
          setSenha("");
          setAberto(false);
        }}
      >
        Salvar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
    </div>
  );
}