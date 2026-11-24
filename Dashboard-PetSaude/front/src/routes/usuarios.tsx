import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { GateShell, usePode, useSession } from "@/components/gate";
import {
  createUser,
  deactivateUser,
  listUsers,
  setUserPassword,
  updateUser,
} from "@/lib/users.functions";
import { listarGrupos, type Grupo } from "@/lib/grupos.functions";
import type { SessionUser } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exigirPermissao } from "@/lib/guardas";
import { rotuloDaArea } from "@/lib/navegacao";
import { AREAS, cabeEm, rotuloDoNivel, type Permissoes } from "@/lib/permissoes";
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
import { EstadoFalha } from "@/components/estado";
import { Selo } from "@/components/selo";

export const Route = createFileRoute("/usuarios")({
  beforeLoad: () => exigirPermissao("usuarios"),
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

/** Quem está usando a tela: as travas comparam com ele. */
type Eu = { id: string; master: boolean; permissoes: Permissoes };

type NovoUsuario = { name: string; email: string; password: string; grupoId: string };

/** Qual caixa de diálogo está aberta, e para quem. */
type Acao =
  | { tipo: "grupo"; alvo: SessionUser }
  | { tipo: "senha"; alvo: SessionUser }
  | { tipo: "desativar"; alvo: SessionUser }
  | null;

/**
 * Por que esta pessoa não pode mexer na conta, ou null se pode.
 *
 * Espelha a trava do back (`exigirQueGerencie`): sem ser master, só se mexe em
 * conta com acesso igual ou menor que o seu. Redefinir a senha de quem tem mais
 * acesso seria entrar como ele.
 */
function motivoParaNaoMexer(alvo: SessionUser, eu: Eu): string | null {
  if (eu.master || alvo.id === eu.id) return null;
  if (alvo.master) return "Conta do master: só o master muda.";
  if (!cabeEm(alvo.permissoes, eu.permissoes)) {
    return "Esta conta tem mais acesso que a sua: só o master muda.";
  }
  return null;
}

/** Os grupos que esta pessoa pode atribuir: o master, todos; os outros, os que cabem no seu acesso. */
function gruposAtribuiveis(grupos: Grupo[], eu: Eu): Grupo[] {
  return eu.master ? grupos : grupos.filter((g) => cabeEm(g.permissoes, eu.permissoes));
}

/** "FAQs (editar), Sem resposta (ver)": o que o grupo abre, na ordem do menu. */
function resumo(permissoes: Permissoes): string {
  return AREAS.filter((area) => permissoes[area])
    .map((area) => `${rotuloDaArea(area)} (${rotuloDoNivel(area, permissoes[area]!)})`)
    .join(", ");
}

/** O grupo com menos acesso: é o ponto de partida mais seguro para uma conta nova. */
function menorGrupo(grupos: Grupo[]): Grupo | undefined {
  const peso = (g: Grupo) =>
    AREAS.reduce(
      (total, a) => total + (g.permissoes[a] === "editar" ? 2 : g.permissoes[a] ? 1 : 0),
      0,
    );
  return [...grupos].sort((a, b) => peso(a) - peso(b))[0];
}

function PainelUsuarios() {
  const { usuario } = useSession();
  const podeEditar = usePode("usuarios", "editar");
  const queryClient = useQueryClient();

  const usuariosQuery = useQuery({ queryKey: ["users"], queryFn: () => listUsers() });
  const gruposQuery = useQuery({ queryKey: ["grupos"], queryFn: () => listarGrupos() });

  const criar = useServerFn(createUser);
  const atualizar = useServerFn(updateUser);
  const desativar = useServerFn(deactivateUser);
  const definirSenha = useServerFn(setUserPassword);

  const [acao, setAcao] = useState<Acao>(null);

  const aoConcluir = (mensagem: string) => {
    // O número de membros de cada grupo muda junto com as contas.
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["grupos"] });
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
    mutationFn: (dados: { id: string; grupoId?: string; master?: boolean; isActive?: boolean }) =>
      atualizar({ data: dados }),
    onSuccess: (_resposta, dados) => {
      aoConcluir("Usuário atualizado");
      // Mudar a própria conta (o master trocando de grupo ou passando o master)
      // muda o menu: a sessão precisa ser relida.
      if (dados.id === usuario?.id) queryClient.invalidateQueries({ queryKey: ["session"] });
    },
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

  if (!usuario) return null;
  const eu: Eu = usuario;

  const usuarios = usuariosQuery.data ?? [];
  const grupos = gruposQuery.data ?? [];
  const atribuiveis = gruposAtribuiveis(grupos, eu);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Usuários"
        frase={
          // O total só com a resposta: "0 contas" durante a espera diria que
          // ninguém tem acesso ao painel.
          usuariosQuery.data
            ? `${usuarios.length === 1 ? "1 conta" : `${usuarios.length} contas`} com acesso ao painel, e o grupo de cada uma.`
            : "Quem tem acesso ao painel, e o grupo de cada conta."
        }
        acoes={
          eu.master && (
            <Button asChild variant="outline">
              <Link to="/grupos">
                <Users /> Grupos e permissões
              </Link>
            </Button>
          )
        }
      />

      {podeEditar &&
        (gruposQuery.isError ? (
          <EstadoFalha
            onTentarDeNovo={() => gruposQuery.refetch()}
            tentando={gruposQuery.isFetching}
          >
            Não foi possível carregar os grupos, e sem eles não dá para criar conta. Confira a
            internet e tente de novo.
          </EstadoFalha>
        ) : gruposQuery.isLoading ? (
          <Carregando texto="Carregando os grupos…" />
        ) : (
          <FormularioNovoUsuario
            grupos={atribuiveis}
            escondidos={grupos.length - atribuiveis.length}
            aoCriar={(dados) => mutCriar.mutateAsync(dados)}
          />
        ))}

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
              eu={eu}
              podeEditar={podeEditar}
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

        A `key` pelo id importa: os dois diálogos guardam estado próprio (o grupo
        escolhido, a senha digitada) e não são remontados sozinhos. Sem ela,
        abrir para uma segunda pessoa mostraria o grupo da primeira, e a senha
        digitada vazaria de um cadastro para o outro.
      */}
      <DialogoGrupo
        key={"grupo-" + (acao?.alvo.id ?? "nenhum")}
        acao={acao}
        eu={eu}
        grupos={atribuiveis}
        salvando={mutAtualizar.isPending}
        aoFechar={() => setAcao(null)}
        aoConfirmar={(mudancas) => acao && mutAtualizar.mutate({ id: acao.alvo.id, ...mudancas })}
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
  eu,
  podeEditar,
  aoAgir,
  aoReativar,
}: {
  usuario: SessionUser;
  eu: Eu;
  podeEditar: boolean;
  aoAgir: (acao: Acao) => void;
  aoReativar: () => void;
}) {
  const ehVoce = usuario.id === eu.id;
  const motivo = podeEditar ? motivoParaNaoMexer(usuario, eu) : null;
  // A própria conta: sem ser master, o grupo fica com outra pessoa (mudar o
  // próprio seria se promover), e desativar a si mesmo ninguém pode.
  const mudaGrupo = !ehVoce || eu.master;

  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          {usuario.name}
          {ehVoce && <Selo tom="marca">Você</Selo>}
          {usuario.master && <Selo tom="atencao">Master</Selo>}
          {!usuario.isActive && <Selo tom="erro">Desativada</Selo>}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {usuario.email} · {usuario.grupo.nome}
        </p>
        {motivo && <p className="mt-1 text-sm text-muted-foreground">{motivo}</p>}
        {podeEditar && ehVoce && !eu.master && (
          <p className="mt-1 text-sm text-muted-foreground">
            O seu grupo só outra pessoa que cuida das contas pode mudar.
          </p>
        )}
      </div>

      {podeEditar && !motivo && (
        <div className="flex flex-wrap gap-2">
          {mudaGrupo && (
            <Button variant="outline" onClick={() => aoAgir({ tipo: "grupo", alvo: usuario })}>
              <Users /> Grupo
            </Button>
          )}

          <Button variant="outline" onClick={() => aoAgir({ tipo: "senha", alvo: usuario })}>
            <KeyRound /> Senha
          </Button>

          {!ehVoce &&
            (usuario.isActive ? (
              <Button variant="perigo" onClick={() => aoAgir({ tipo: "desativar", alvo: usuario })}>
                Desativar
              </Button>
            ) : (
              <Button variant="outline" onClick={aoReativar}>
                <ShieldCheck /> Reativar
              </Button>
            ))}
        </div>
      )}
    </li>
  );
}

function DialogoGrupo({
  acao,
  eu,
  grupos,
  salvando,
  aoFechar,
  aoConfirmar,
}: {
  acao: Acao;
  eu: Eu;
  grupos: Grupo[];
  salvando: boolean;
  aoFechar: () => void;
  aoConfirmar: (mudancas: { grupoId?: string; master?: boolean }) => void;
}) {
  const aberto = acao?.tipo === "grupo";
  const alvo = acao?.alvo;
  const [grupoId, setGrupoId] = useState(alvo?.grupo.id ?? "");
  const [master, setMaster] = useState(alvo?.master ?? false);
  const ehVoce = alvo?.id === eu.id;
  const escolhido = grupos.find((g) => g.id === grupoId);

  const confirmar = () => {
    if (!alvo) return;
    const mudancas: { grupoId?: string; master?: boolean } = {};
    if (grupoId !== alvo.grupo.id) mudancas.grupoId = grupoId;
    if (master !== alvo.master) mudancas.master = master;
    if (Object.keys(mudancas).length === 0) {
      aoFechar();
      return;
    }
    aoConfirmar(mudancas);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grupo de {alvo?.name}</DialogTitle>
          <DialogDescription>
            O grupo define o que a pessoa vê e muda no painel. A mudança vale na próxima tela que
            ela abrir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="grupo-usuario">Grupo</Label>
          <Select value={grupoId} onValueChange={setGrupoId}>
            <SelectTrigger id="grupo-usuario" className="h-11 w-full">
              <SelectValue placeholder="Escolha o grupo" />
            </SelectTrigger>
            <SelectContent>
              {grupos.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {escolhido && (
            <p className="text-sm text-muted-foreground">Abre: {resumo(escolhido.permissoes)}.</p>
          )}
        </div>

        {/*
          O master vale por cima do grupo: cria e muda os grupos, e passa o master
          adiante. Só o master vê esta caixa, porque só ele pode dar o master.
        */}
        {eu.master && (
          <div className="space-y-2">
            <Label
              htmlFor="master-usuario"
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3"
            >
              <Checkbox
                id="master-usuario"
                checked={master}
                onCheckedChange={(v) => setMaster(v === true)}
              />
              <span>
                <span className="block font-semibold">Master</span>
                <span className="block text-sm font-normal text-muted-foreground">
                  Cria e muda os grupos, e vê tudo, seja qual for o grupo.
                </span>
              </span>
            </Label>
            {ehVoce && !master && (
              <p className="rounded-lg bg-destructive-soft p-3 text-sm font-semibold text-destructive">
                Esta é a sua conta. Sem o master você deixa de mudar os grupos, e só outro master
                pode devolvê-lo. Se você for o único, o painel recusa.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvando} onClick={confirmar}>
            {salvando ? "Salvando…" : "Salvar"}
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

function FormularioNovoUsuario({
  grupos,
  escondidos,
  aoCriar,
}: {
  grupos: Grupo[];
  /** Quantos grupos ficaram fora da lista por darem mais acesso que o seu. */
  escondidos: number;
  aoCriar: (dados: NovoUsuario) => Promise<unknown>;
}) {
  const padrao = menorGrupo(grupos)?.id ?? "";
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [grupoId, setGrupoId] = useState(padrao);
  const [salvando, setSalvando] = useState(false);
  const escolhido = grupos.find((g) => g.id === grupoId);

  /**
   * LÓGICA DO LUCIANO: os campos só são limpos DEPOIS que o backend aceitou.
   * Antes a limpeza era síncrona, logo após disparar a mutação, então um e-mail
   * duplicado devolvia o toast de erro com o formulário já vazio e o
   * administrador redigitava tudo. Lia-se como "apagou o que eu escrevi".
   */
  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!grupoId) {
      toast.error("Escolha o grupo da pessoa antes de criar a conta.");
      return;
    }
    setSalvando(true);
    try {
      await aoCriar({ name: nome, email, password: senha, grupoId });
      setNome("");
      setEmail("");
      setSenha("");
      setGrupoId(padrao);
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
        <p className="mt-1 text-sm text-muted-foreground">
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
        <Label htmlFor="novo-grupo">Grupo</Label>
        <Select value={grupoId} onValueChange={setGrupoId}>
          <SelectTrigger id="novo-grupo" className="h-11">
            <SelectValue placeholder="Escolha o grupo" />
          </SelectTrigger>
          <SelectContent>
            {grupos.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {escolhido && (
          <p className="text-sm text-muted-foreground">Abre: {resumo(escolhido.permissoes)}.</p>
        )}
        {escondidos > 0 && (
          <p className="text-sm text-muted-foreground">
            {escondidos === 1
              ? "1 grupo dá mais acesso que o seu e não aparece aqui: só o master põe pessoas nele."
              : `${escondidos} grupos dão mais acesso que o seu e não aparecem aqui: só o master põe pessoas neles.`}
          </p>
        )}
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Criando…" : "Criar usuário"}
        </Button>
      </div>
    </form>
  );
}
