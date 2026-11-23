import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GateShell } from "@/components/gate";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Carregando } from "@/components/carregando";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  apagarGrupo,
  atualizarGrupo,
  criarGrupo,
  listarGrupos,
  type Grupo,
} from "@/lib/grupos.functions";
import { exigirMaster } from "@/lib/guardas";
import { DESTINOS, GRUPOS, type Destino } from "@/lib/navegacao";
import { AREAS, INFO_AREA, type Area, type Nivel, type Permissoes } from "@/lib/permissoes";

type Busca = { base?: string };

export const Route = createFileRoute("/grupos/$id")({
  beforeLoad: () => exigirMaster(),
  // `base`: o grupo de onde o novo copia as permissões (botão Duplicar).
  validateSearch: (search: Record<string, unknown>): Busca =>
    typeof search.base === "string" && search.base ? { base: search.base } : {},
  head: () => ({ meta: [{ title: "Grupo | Central de FAQs" }] }),
  component: GrupoPage,
});

type Escolha = Nivel | "nada";
type Grade = Record<Area, Escolha>;

const ROTULO_ESCOLHA: Record<Escolha, string> = {
  nada: "Sem acesso",
  ver: "Ver",
  editar: "Editar",
};

function gradeDe(permissoes: Permissoes): Grade {
  return Object.fromEntries(AREAS.map((a) => [a, permissoes[a] ?? "nada"])) as Grade;
}

function GrupoPage() {
  return (
    <GateShell>
      <EditorDeGrupo />
    </GateShell>
  );
}

function EditorDeGrupo() {
  const { id } = Route.useParams();
  const { base } = Route.useSearch();
  const novo = id === "novo";
  const grupos = useQuery({ queryKey: ["grupos"], queryFn: () => listarGrupos() });

  const voltar = (
    <Button asChild variant="outline" size="icon" aria-label="Voltar para Grupos">
      <Link to="/grupos">
        <ArrowLeft />
      </Link>
    </Button>
  );

  if (grupos.isError) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina titulo="Grupo" antes={voltar} />
        <EstadoFalha onTentarDeNovo={() => grupos.refetch()} tentando={grupos.isFetching}>
          Não foi possível carregar os grupos. Confira a internet e tente de novo.
        </EstadoFalha>
      </div>
    );
  }
  if (grupos.isLoading || !grupos.data) {
    return <Carregando texto="Carregando o grupo…" />;
  }

  const existente = novo ? undefined : grupos.data.find((g) => g.id === id);
  if (!novo && !existente) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina titulo="Grupo" antes={voltar} />
        <EstadoVazio
          titulo="Este grupo não existe mais"
          acao={
            <Button asChild variant="outline">
              <Link to="/grupos">Ver os grupos</Link>
            </Button>
          }
        >
          Alguém pode tê-lo apagado. A lista mostra os grupos que existem agora.
        </EstadoVazio>
      </div>
    );
  }

  const modelo = novo && base ? grupos.data.find((g) => g.id === base) : undefined;

  return (
    <FormularioGrupo
      // Trocar de grupo pela URL precisa recomeçar o formulário do zero.
      key={id + (base ?? "")}
      voltar={voltar}
      grupo={existente}
      modelo={modelo}
      total={grupos.data.length}
    />
  );
}

function FormularioGrupo({
  voltar,
  grupo,
  modelo,
  total,
}: {
  voltar: React.ReactNode;
  /** O grupo que está sendo editado; ausente ao criar. */
  grupo?: Grupo;
  /** Ao duplicar: o grupo de onde vêm as permissões iniciais. */
  modelo?: Grupo;
  total: number;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const criar = useServerFn(criarGrupo);
  const atualizar = useServerFn(atualizarGrupo);
  const apagar = useServerFn(apagarGrupo);

  const [nome, setNome] = useState(grupo?.nome ?? (modelo ? `${modelo.nome} (cópia)` : ""));
  const [descricao, setDescricao] = useState(grupo?.descricao ?? modelo?.descricao ?? "");
  const [grade, setGrade] = useState<Grade>(
    gradeDe(grupo?.permissoes ?? modelo?.permissoes ?? { faqs: "ver" }),
  );
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);

  const membros = grupo ? grupo.membros + grupo.desativadas : 0;

  const aoTerminar = (mensagem: string) => {
    // A lista de contas mostra o acesso de cada uma, e a sessão de quem está
    // aqui pode ter mudado junto.
    void queryClient.invalidateQueries({ queryKey: ["grupos"] });
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["session"] });
    toast.success(mensagem);
    void navigate({ to: "/grupos" });
  };

  const salvar = useMutation({
    mutationFn: () => {
      const dados = { nome, descricao, permissoes: grade };
      return grupo ? atualizar({ data: { id: grupo.id, ...dados } }) : criar({ data: dados });
    },
    onSuccess: () =>
      aoTerminar(
        grupo
          ? grupo.membros > 0
            ? grupo.membros === 1
              ? "Grupo salvo. Vale para a pessoa do grupo na próxima tela que ela abrir."
              : `Grupo salvo. Vale para as ${grupo.membros} pessoas do grupo na próxima tela que abrirem.`
            : "Grupo salvo."
          : "Grupo criado. Na tela de Usuários, ponha as pessoas nele.",
      ),
    onError: (erro: Error) =>
      toast.error(
        erro.message || "Não foi possível salvar o grupo. Confira a internet e tente de novo.",
      ),
  });

  const mutApagar = useMutation({
    mutationFn: () => apagar({ data: { id: grupo!.id } }),
    onSuccess: () => aoTerminar("Grupo apagado."),
    onError: (erro: Error) => {
      setConfirmandoApagar(false);
      toast.error(
        erro.message || "Não foi possível apagar o grupo. Confira a internet e tente de novo.",
      );
    },
  });

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    salvar.mutate();
  };

  return (
    <form onSubmit={enviar} className="space-y-6">
      <CabecalhoPagina
        titulo={grupo ? grupo.nome : "Novo grupo"}
        antes={voltar}
        frase={
          grupo
            ? grupo.membros > 0
              ? grupo.membros === 1
                ? "Mudar aqui muda o acesso da pessoa deste grupo, na próxima tela que ela abrir."
                : `Mudar aqui muda o acesso das ${grupo.membros} pessoas deste grupo, na próxima tela que abrirem.`
              : "Ninguém está neste grupo ainda."
            : "Marque o que os membros veem e mudam em cada item do menu."
        }
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-2">
          <Label htmlFor="grupo-nome">Nome</Label>
          <Input
            id="grupo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            minLength={2}
            maxLength={60}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grupo-descricao">Para quem é (opcional)</Label>
          <Input
            id="grupo-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={200}
            autoComplete="off"
            placeholder="Por exemplo: estudantes que respondem as perguntas sem resposta"
          />
        </div>
      </div>

      {GRUPOS.map((secao) => {
        const destinos = DESTINOS.filter((d) => d.grupo === secao.id && d.area);
        if (destinos.length === 0) return null;
        return (
          <section key={secao.id} aria-labelledby={`secao-${secao.id}`} className="space-y-2">
            <h2 id={`secao-${secao.id}`} className="text-base font-semibold">
              {secao.rotulo}
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {destinos.map((destino) => (
                <LinhaDeArea
                  key={destino.para}
                  destino={destino}
                  valor={grade[destino.area as Area]}
                  aoMudar={(valor) =>
                    setGrade((atual) => ({ ...atual, [destino.area as Area]: valor }))
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : grupo ? "Salvar grupo" : "Criar grupo"}
        </Button>
        <Button asChild variant="ghost">
          <Link to="/grupos">Cancelar</Link>
        </Button>
      </div>

      {grupo && (
        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="text-base font-semibold">Apagar este grupo</h2>
          {membros > 0 ? (
            <p className="text-sm text-muted-foreground">
              Para apagar, mova antes {membros === 1 ? "a conta" : `as ${membros} contas`} deste
              grupo para outro, na tela de{" "}
              <Link to="/usuarios" className="font-semibold text-primary underline">
                Usuários
              </Link>
              {grupo.desativadas > 0 && ", inclusive as desativadas"}.
            </p>
          ) : total <= 1 ? (
            <p className="text-sm text-muted-foreground">
              É o único grupo. Crie outro antes, para as contas novas terem onde entrar.
            </p>
          ) : (
            <Button type="button" variant="perigo" onClick={() => setConfirmandoApagar(true)}>
              <Trash2 /> Apagar grupo
            </Button>
          )}
        </section>
      )}

      <AlertDialog open={confirmandoApagar} onOpenChange={setConfirmandoApagar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o grupo {grupo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ninguém está nele, então nenhum acesso muda. O Histórico guarda que ele existiu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutApagar.mutate();
              }}
              disabled={mutApagar.isPending}
            >
              {mutApagar.isPending ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/**
 * Uma linha da grade: um item do menu e o nível do grupo nele.
 *
 * Rádios nativos, e não botões: a pessoa anda entre as opções com as setas e o
 * leitor de tela anuncia "Conversas, Ver, selecionado, 2 de 3". Só aparecem os
 * níveis que a área tem, em vez de opções apagadas sem explicação.
 */
function LinhaDeArea({
  destino,
  valor,
  aoMudar,
}: {
  destino: Destino;
  valor: Escolha;
  aoMudar: (valor: Escolha) => void;
}) {
  const area = destino.area as Area;
  const info = INFO_AREA[area];
  // Todo grupo vê as FAQs: é a tela inicial, e o back garante o mínimo.
  const opcoes = (["nada", "ver", "editar"] as const).filter((n) =>
    n === "nada" ? area !== "faqs" : Boolean(info.niveis[n]),
  );
  const descricao =
    valor === "nada"
      ? "Não aparece no menu."
      : area === "faqs" && valor === "ver"
        ? `${info.niveis.ver}. Todo grupo vê as FAQs: é a tela inicial.`
        : `${info.niveis[valor]}.`;
  const idDescricao = `descricao-${area}`;

  return (
    <fieldset
      aria-describedby={idDescricao}
      className="flex flex-col gap-2.5 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <legend className="sr-only">{destino.rotulo}</legend>
      <div className="min-w-0 flex-1">
        <p aria-hidden="true" className="flex items-center gap-2 text-[15px] font-semibold">
          <destino.Icone className="size-4 shrink-0" />
          {destino.rotulo}
        </p>
        <p id={idDescricao} className="text-sm text-muted-foreground">
          {descricao}
          {info.dadoDeCidadao && valor !== "nada" && (
            <span className="block font-semibold text-warning">
              Mostra o que cidadãos escreveram no chat.
            </span>
          )}
          {area === "usuarios" && valor === "editar" && (
            <span className="block">Só põe pessoas em grupos que não passam do acesso deste.</span>
          )}
        </p>
      </div>

      <div className="inline-flex shrink-0 gap-0.5 self-start rounded-lg bg-muted p-[3px] sm:self-center">
        {opcoes.map((opcao) => (
          <label key={opcao} className="relative">
            <input
              type="radio"
              name={`nivel-${area}`}
              value={opcao}
              checked={valor === opcao}
              onChange={() => aoMudar(opcao)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-md px-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {ROTULO_ESCOLHA[opcao]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
