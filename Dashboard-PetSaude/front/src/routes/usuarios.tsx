import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, ShieldCheck, UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { GateShell, useSession } from "@/components/gate";
import {
  createUser,
  deactivateUser,
  listUsers,
  setUserPassword,
  updateUser,
} from "@/lib/users.functions";
import type { SessionUser, UserRole } from "@/lib/auth.functions";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Selo } from "@/components/selo";

const PAPEIS: { valor: UserRole; rotulo: string; descricao: string }[] = [
  { valor: "admin", rotulo: "Administrador", descricao: "Gerencia usuários e FAQs" },
  { valor: "editor", rotulo: "Editor", descricao: "Cria e edita FAQs" },
  { valor: "leitor", rotulo: "Leitor", descricao: "Apenas consulta" },
];

const ROTULO_PAPEL: Record<UserRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  leitor: "Leitor",
};

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

type NovoUsuario = { name: string; email: string; password: string; role: UserRole };

/** Qual caixa de diálogo está aberta, e para quem. */
type Acao =
  | { tipo: "papel"; alvo: SessionUser }
  | { tipo: "senha"; alvo: SessionUser }
  | { tipo: "desativar"; alvo: SessionUser }
  | null;

function PainelUsuarios() {
  const { usuario } = useSession();
  const queryClient = useQueryClient();

  const usuariosQuery = useQuery({ queryKey: ["users"], queryFn: () => listUsers() });

  const criar = useServerFn(createUser);
  const atualizar = useServerFn(updateUser);
  const desativar = useServerFn(deactivateUser);
  const definirSenha = useServerFn(setUserPassword);

  const [acao, setAcao] = useState<Acao>(null);

  const aoConcluir = (mensagem: string) => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
    setAcao(null);
    toast.success(mensagem);
  };

  const avisar = (padrao: string) => (erro: Error) =>
    toast.error(erro.message || `${padrao} Confira a internet e tente de novo.`);

  const mutCriar = useMutation({
    mutationFn: (dados: NovoUsuario) => criar({ data: dados }),
    onSuccess: () => aoConcluir("Usuário criado"),
    onError: avisar("Não foi possível criar a conta."),
  });

  const mutAtualizar = useMutation({
    mutationFn: (dados: { id: string; role?: UserRole; isActive?: boolean }) =>
      atualizar({ data: dados }),
    onSuccess: () => aoConcluir("Usuário atualizado"),
    onError: avisar("Não foi possível salvar a mudança."),
  });

  const mutDesativar = useMutation({
    mutationFn: (id: string) => desativar({ data: { id } }),
    onSuccess: () => aoConcluir("Usuário desativado"),
    onError: avisar("Não foi possível desativar a conta."),
  });

  const mutSenha = useMutation({
    mutationFn: (dados: { id: string; newPassword: string }) => definirSenha({ data: dados }),
    onSuccess: () => aoConcluir("Senha redefinida. O usuário precisará trocá-la ao entrar."),
    onError: avisar("Não foi possível redefinir a senha."),
  });

  // A tela só existe para admin, mas o backend é quem garante: a rota inteira
  // é anotada com Roles('admin'). Isto aqui evita mostrar uma página que só
  // devolveria 403.
  if (usuario && usuario.role !== "admin") {
    return (
      <EstadoVazio titulo="Só administradores gerenciam usuários">
        Peça a um administrador para criar ou mudar uma conta.
      </EstadoVazio>
    );
  }

  const usuarios = usuariosQuery.data ?? [];

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Usuários"
        frase={
          // O total só com a resposta: "0 contas" durante a espera diria que
          // ninguém tem acesso ao painel.
          usuariosQuery.data
            ? `${usuarios.length === 1 ? "1 conta" : `${usuarios.length} contas`} com acesso ao painel, e o que cada uma pode fazer.`
            : "Quem tem acesso ao painel, e o que cada conta pode fazer."
        }
      />

      <FormularioNovoUsuario aoCriar={(dados) => mutCriar.mutateAsync(dados)} />

      {usuariosQuery.isError ? (
        <EstadoFalha
          onTentarDeNovo={() => usuariosQuery.refetch()}
          tentando={usuariosQuery.isFetching}
        >
          Não foi possível carregar as contas. Confira a internet e tente de novo.
        </EstadoFalha>
      ) : usuariosQuery.isLoading ? (
        <Carregando texto="Carregando as contas…" />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {usuarios.map((u) => (
            <LinhaUsuario
              key={u.id}
              usuario={u}
              ehVoce={u.id === usuario?.id}
              aoAgir={setAcao}
              aoReativar={() => mutAtualizar.mutate({ id: u.id, isActive: true })}
            />
          ))}
        </ul>
      )}

      {/*
        Um diálogo para a página inteira, e não um por linha.

        LÓGICA DO LUCIANO: antes cada linha tinha o próprio Select de papel, e
        era isso que travava a tela. O Radix guarda o valor original de
        body.style.pointerEvents numa variável de módulo compartilhada por todas
        as camadas; com N Selects irmãos mais o menu lateral, bastava uma camada
        montar antes de a anterior terminar a limpeza para o valor salvo virar
        "none" e ser gravado de volta para sempre. O body parava de aceitar
        clique, foco e digitação. Nem no campo Nome dava para clicar, e só o F5
        desfazia. Com um diálogo só, montado sob demanda, não há camadas irmãs
        disputando.

        A `key` pelo id importa: os dois diálogos guardam estado próprio (o papel
        escolhido, a senha digitada) e não são remontados sozinhos. Sem ela,
        abrir para uma segunda pessoa mostraria o papel da primeira, e a senha
        digitada vazaria de um cadastro para o outro.
      */}
      <DialogoPapel
        key={"papel-" + (acao?.alvo.id ?? "nenhum")}
        acao={acao}
        ehVoce={acao?.alvo.id === usuario?.id}
        salvando={mutAtualizar.isPending}
        aoFechar={() => setAcao(null)}
        aoConfirmar={(papel) => acao && mutAtualizar.mutate({ id: acao.alvo.id, role: papel })}
      />

      <DialogoSenha
        key={"senha-" + (acao?.alvo.id ?? "nenhum")}
        acao={acao}
        salvando={mutSenha.isPending}
        aoFechar={() => setAcao(null)}
        aoConfirmar={(senha) => acao && mutSenha.mutate({ id: acao.alvo.id, newPassword: senha })}
      />

      <AlertDialog open={acao?.tipo === "desativar"} onOpenChange={(v) => !v && setAcao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {acao?.alvo.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa perde o acesso imediatamente e as sessões abertas dela são encerradas. A
              conta não é apagada: dá para reativar depois, e o histórico de alterações continua com
              o nome dela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (acao) mutDesativar.mutate(acao.alvo.id);
              }}
              disabled={mutDesativar.isPending}
            >
              {mutDesativar.isPending ? "Desativando…" : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LinhaUsuario({
  usuario,
  ehVoce,
  aoAgir,
  aoReativar,
}: {
  usuario: SessionUser;
  ehVoce: boolean;
  aoAgir: (acao: Acao) => void;
  aoReativar: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          {usuario.name}
          {ehVoce && <Selo tom="marca">Você</Selo>}
          {!usuario.isActive && <Selo tom="erro">Desativada</Selo>}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {usuario.email} · {ROTULO_PAPEL[usuario.role]}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => aoAgir({ tipo: "papel", alvo: usuario })}
        >
          <UserCog /> Papel
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => aoAgir({ tipo: "senha", alvo: usuario })}
        >
          <KeyRound /> Senha
        </Button>

        {usuario.isActive ? (
          <Button
            variant="perigo"
            size="sm"
            onClick={() => aoAgir({ tipo: "desativar", alvo: usuario })}
          >
            Desativar
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={aoReativar}>
            <ShieldCheck /> Reativar
          </Button>
        )}
      </div>
    </li>
  );
}

function DialogoPapel({
  acao,
  ehVoce,
  salvando,
  aoFechar,
  aoConfirmar,
}: {
  acao: Acao;
  ehVoce: boolean;
  salvando: boolean;
  aoFechar: () => void;
  aoConfirmar: (papel: UserRole) => void;
}) {
  const aberto = acao?.tipo === "papel";
  const [papel, setPapel] = useState<UserRole>(acao?.alvo.role ?? "leitor");

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Papel de {acao?.alvo.name}</DialogTitle>
          <DialogDescription>O papel define o que a pessoa pode fazer no painel.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="papel-usuario">Novo papel</Label>
          <Select value={papel} onValueChange={(v) => setPapel(v as UserRole)}>
            <SelectTrigger id="papel-usuario" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPEIS.map((p) => (
                <SelectItem key={p.valor} value={p.valor}>
                  {p.rotulo} ({p.descricao})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/*
          Rebaixar a si mesmo é um clique que tira o próprio acesso a esta tela,
          e só outro administrador consegue desfazer. Antes não havia aviso
          nenhum: o Select trocava o papel direto no onValueChange.
        */}
        {ehVoce && papel !== "admin" && (
          <p className="rounded-lg bg-destructive-soft p-3 text-sm font-semibold text-destructive">
            Esta é a sua conta. Ao sair de administrador você perde o acesso a esta tela, e só outro
            administrador pode devolvê-lo.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvando} onClick={() => aoConfirmar(papel)}>
            {salvando ? "Salvando…" : "Alterar papel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoSenha({
  acao,
  salvando,
  aoFechar,
  aoConfirmar,
}: {
  acao: Acao;
  salvando: boolean;
  aoFechar: () => void;
  aoConfirmar: (senha: string) => void;
}) {
  const aberto = acao?.tipo === "senha";
  const [senha, setSenha] = useState("");
  const [tentou, setTentou] = useState(false);
  const curta = (tentou || senha.length > 0) && senha.length < 8;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir a senha de {acao?.alvo.name}</DialogTitle>
          <DialogDescription>
            A senha é provisória: a pessoa vai precisar trocá-la no próximo acesso. As sessões
            abertas dela são encerradas agora.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="senha-provisoria">Senha provisória</Label>
          <Input
            id="senha-provisoria"
            name="senha-provisoria"
            type="password"
            value={senha}
            minLength={8}
            autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={curta}
            aria-describedby="ajuda-senha-provisoria"
          />
          <p
            id="ajuda-senha-provisoria"
            className={
              curta ? "text-sm font-semibold text-destructive" : "text-sm text-muted-foreground"
            }
          >
            {curta && senha.length === 0
              ? "Escreva a senha provisória, com ao menos 8 caracteres."
              : "Ao menos 8 caracteres."}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando}
            onClick={() => {
              setTentou(true);
              if (senha.length >= 8) aoConfirmar(senha);
            }}
          >
            {salvando ? "Salvando…" : "Redefinir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormularioNovoUsuario({ aoCriar }: { aoCriar: (dados: NovoUsuario) => Promise<unknown> }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<UserRole>("leitor");
  const [salvando, setSalvando] = useState(false);

  /**
   * LÓGICA DO LUCIANO: os campos só são limpos DEPOIS que o backend aceitou.
   * Antes a limpeza era síncrona, logo após disparar a mutação, então um e-mail
   * duplicado devolvia o toast de erro com o formulário já vazio e o
   * administrador redigitava tudo. Lia-se como "apagou o que eu escrevi".
   */
  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      await aoCriar({ name: nome, email, password: senha, role: papel });
      setNome("");
      setEmail("");
      setSenha("");
      setPapel("leitor");
    } catch {
      // O onError da mutação já mostrou o motivo. Aqui só não se apaga nada.
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form
      onSubmit={enviar}
      /*
       * autoComplete off no formulário e nomes próprios em cada campo.
       *
       * Esta era a única tela do app sem autoComplete, e a única em que o
       * formulário "travava". Com um campo de e-mail e um de senha lado a lado,
       * o navegador classifica o conjunto como login e oferece as credenciais do
       * próprio administrador. Como os campos são controlados pelo React, o
       * preenchimento automático não passa pelo onChange e o render seguinte
       * grava vazio por cima: o campo se esvazia sozinho enquanto a pessoa
       * digita, e o balão do gerenciador de senhas cobre o campo e engole as
       * teclas.
       *
       * "new-password" na senha é o que impede a sugestão de credencial salva.
       * "off" sozinho é ignorado por navegador baseado em Chromium em campo de
       * senha.
       */
      autoComplete="off"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5"
    >
      <div className="sm:col-span-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <UserPlus className="size-4" /> Novo usuário
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A senha definida aqui é provisória: a troca será exigida no primeiro acesso.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="novo-nome">Nome</Label>
        <Input
          id="novo-nome"
          name="nome-do-novo-usuario"
          autoComplete="off"
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
          name="email-do-novo-usuario"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nova-senha">Senha provisória</Label>
        <Input
          id="nova-senha"
          name="senha-do-novo-usuario"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="novo-papel">Papel</Label>
        <Select value={papel} onValueChange={(v) => setPapel(v as UserRole)}>
          <SelectTrigger id="novo-papel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAPEIS.map((p) => (
              <SelectItem key={p.valor} value={p.valor}>
                {p.rotulo} ({p.descricao})
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
