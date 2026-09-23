import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronRight, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
  listarRevisaoCategorias,
  normalizarCategoria,
  type Categoria,
  type GrupoRevisao,
  type MotivoRevisao,
} from "@/lib/categorias.functions";
import { GateShell, useSession } from "@/components/gate";
import { InsertFaqButton } from "@/components/faq-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { exigirSessao } from "@/lib/guardas";
import { Carregando } from "@/components/carregando";

export const Route = createFileRoute("/categorias/")({
  beforeLoad: () => exigirSessao(),
  head: () => ({
    meta: [
      { title: "Categorias de FAQs | Central de FAQs" },
      {
        name: "description",
        content: "Defina a lista oficial de assuntos e veja quais perguntas estão fora dela.",
      },
      { property: "og:title", content: "Categorias de FAQs" },
      {
        property: "og:description",
        content: "Navegue pelas categorias e abra as perguntas frequentes de cada tema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoriasPage,
});

/**
 * O que cada motivo significa em uma frase, e o quanto ele pesa.
 *
 * LÓGICA DO LUCIANO: a diferença entre estes quatro é a diferença entre
 * trabalhos completamente distintos. `variante` é mecânico — a chave já disse
 * que é o mesmo assunto, só falta escrever igual, e um botão resolve o grupo
 * inteiro. `fora_da_lista` precisa de alguém da saúde decidindo se aquilo é um
 * assunto de verdade. Misturar os dois numa lista só de "problemas" é o que
 * fazia a curadoria parecer impossível: 236 itens sem fila nem prioridade.
 */
const MOTIVOS: Record<MotivoRevisao, { rotulo: string; explicacao: string; tom: string }> = {
  variante: {
    rotulo: "Grafia diferente",
    explicacao: "É um assunto da lista, escrito de outro jeito. Padronizar resolve o grupo todo.",
    tom: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  fora_da_lista: {
    rotulo: "Fora da lista",
    explicacao: "Nenhum assunto oficial corresponde. Alguém precisa decidir o destino.",
    tom: "border-destructive/40 bg-destructive/5 text-destructive",
  },
  inativa: {
    rotulo: "Assunto aposentado",
    explicacao:
      "A categoria existe, mas foi desativada. As perguntas continuam apontando para ela.",
    tom: "border-muted-foreground/30 bg-muted text-muted-foreground",
  },
  sem_categoria: {
    rotulo: "Sem categoria",
    explicacao: "O campo está vazio. A pergunta entra na busca sem assunto nenhum.",
    tom: "border-destructive/40 bg-destructive/5 text-destructive",
  },
};

function CategoriasPage() {
  const { usuario } = useSession();
  const podeDefinir = usuario?.role === "admin";

  const listaQuery = useQuery({
    queryKey: ["categorias", true],
    queryFn: () => listarCategorias({ data: { incluirInativas: true } }),
  });
  const revisaoQuery = useQuery({
    queryKey: ["categorias-revisao"],
    queryFn: () => listarRevisaoCategorias(),
  });

  const [formAberto, setFormAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Categoria | null>(null);

  const categorias = listaQuery.data?.categorias ?? [];
  const revisao = revisaoQuery.data;

  return (
    <GateShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Categorias</h2>
            <p className="text-sm text-muted-foreground">
              {categorias.length === 0
                ? "A lista de assuntos ainda não foi definida"
                : `${categorias.length} ${categorias.length === 1 ? "assunto" : "assuntos"} na lista oficial`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeDefinir && (
              <Button
                onClick={() => {
                  setEmEdicao(null);
                  setFormAberto(true);
                }}
              >
                <Plus className="size-4" /> Nova categoria
              </Button>
            )}
            <InsertFaqButton />
          </div>
        </div>

        <ListaOficial
          categorias={categorias}
          carregando={listaQuery.isLoading}
          erro={listaQuery.isError}
          podeDefinir={podeDefinir}
          onEditar={(categoria) => {
            setEmEdicao(categoria);
            setFormAberto(true);
          }}
        />

        <Revisao revisao={revisao} carregando={revisaoQuery.isLoading} podeDefinir={podeDefinir} />
      </div>

      <DialogoCategoria aberto={formAberto} onOpenChange={setFormAberto} categoria={emEdicao} />
    </GateShell>
  );
}

function ListaOficial({
  categorias,
  carregando,
  erro,
  podeDefinir,
  onEditar,
}: {
  categorias: Categoria[];
  carregando: boolean;
  erro: boolean;
  podeDefinir: boolean;
  onEditar: (categoria: Categoria) => void;
}) {
  if (erro) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive sm:p-8">
        Não foi possível carregar os assuntos. Verifique a conexão e tente recarregar.
      </p>
    );
  }

  if (carregando) return <Carregando texto="Carregando os assuntos…" />;

  if (categorias.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center sm:p-8">
        <p className="text-sm font-medium">A lista de assuntos começa vazia, de propósito</p>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          Quem define quais assuntos existem é a equipe de saúde. Enquanto a lista estiver vazia, o
          formulário de FAQ continua aceitando texto livre — e todas as perguntas da base aparecem
          abaixo como fora da lista, que é verdade, mas não ajuda ninguém.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categorias.map((categoria) => (
        <li
          key={categoria.id}
          className="flex flex-col justify-between gap-3 rounded-lg border border-border panel-surface p-4 sm:p-5"
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-base font-semibold">{categoria.nome}</span>
              {!categoria.ativa && (
                <span className="shrink-0 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  aposentado
                </span>
              )}
            </div>
            {categoria.descricao && (
              <p className="mt-1 text-xs text-muted-foreground">{categoria.descricao}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Link
              to="/categorias/$categoria"
              params={{ categoria: categoria.nome }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {categoria.faqs} {categoria.faqs === 1 ? "pergunta" : "perguntas"}
              <ChevronRight className="size-3.5" />
            </Link>
            {podeDefinir && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEditar(categoria)}>
                  Editar
                </Button>
                <BotaoExcluir categoria={categoria} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Revisao({
  revisao,
  carregando,
  podeDefinir,
}: {
  revisao?: {
    resumo: { faqs: number; grupos: number };
    grupos: GrupoRevisao[];
    listaVazia: boolean;
  };
  carregando: boolean;
  podeDefinir: boolean;
}) {
  if (carregando || !revisao) return null;

  if (revisao.grupos.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Precisa de revisão</h3>
        <p className="rounded-lg border border-border panel-surface p-4 text-sm text-muted-foreground">
          Nenhuma pergunta está fora da lista. Toda FAQ ativa aponta para um assunto oficial.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Precisa de revisão</h3>
        <p className="text-sm text-muted-foreground">
          {revisao.resumo.faqs} {revisao.resumo.faqs === 1 ? "pergunta" : "perguntas"} em{" "}
          {revisao.resumo.grupos} {revisao.resumo.grupos === 1 ? "assunto" : "assuntos"} que não
          fecham com a lista. Os que afetam mais perguntas vêm primeiro.
        </p>
      </div>

      {revisao.listaVazia && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Com a lista vazia, tudo aparece aqui. Cadastre os assuntos primeiro — quando um nome
            desta lista virar categoria oficial, as perguntas dele saem daqui sem mais nenhum
            trabalho, e sem regerar vetor nenhum.
          </span>
        </p>
      )}

      <ul className="space-y-3">
        {revisao.grupos.map((grupo) => (
          <CartaoRevisao
            key={`${grupo.motivo}:${grupo.categoria}`}
            grupo={grupo}
            podeDefinir={podeDefinir}
          />
        ))}
      </ul>
    </section>
  );
}

function CartaoRevisao({ grupo, podeDefinir }: { grupo: GrupoRevisao; podeDefinir: boolean }) {
  const queryClient = useQueryClient();
  const criar = useServerFn(criarCategoria);

  const motivo = MOTIVOS[grupo.motivo];

  const adotar = useMutation({
    mutationFn: () => criar({ data: { nome: grupo.categoria } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categorias"] });
      await queryClient.invalidateQueries({ queryKey: ["categorias-revisao"] });
      toast.success(`"${grupo.categoria}" entrou na lista oficial`);
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível adicionar"),
  });

  return (
    <li className="rounded-lg border border-border panel-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{grupo.categoria || "(campo vazio)"}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${motivo.tom}`}>
              {motivo.rotulo}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{motivo.explicacao}</p>
          {grupo.sugestao && (
            <p className="mt-1 text-xs text-muted-foreground">
              Assunto oficial correspondente: <strong>{grupo.sugestao}</strong>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            to="/categorias/$categoria"
            params={{ categoria: grupo.categoria || "Sem categoria" }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {grupo.quantidade} {grupo.quantidade === 1 ? "pergunta" : "perguntas"}
            <ChevronRight className="size-3.5" />
          </Link>
          {podeDefinir && grupo.motivo === "fora_da_lista" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={adotar.isPending}
              onClick={() => adotar.mutate()}
            >
              {adotar.isPending ? "Adicionando…" : "Adicionar à lista"}
            </Button>
          )}
        </div>
      </div>

      {grupo.exemplos.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {grupo.exemplos.map((exemplo) => (
            <li key={exemplo.id} className="truncate text-xs text-muted-foreground">
              <Link to="/faqs/$id" params={{ id: exemplo.id }} className="hover:text-foreground">
                {exemplo.question}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DialogoCategoria({
  aberto,
  onOpenChange,
  categoria,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  categoria: Categoria | null;
}) {
  const queryClient = useQueryClient();
  const criar = useServerFn(criarCategoria);
  const atualizar = useServerFn(atualizarCategoria);
  const normalizar = useServerFn(normalizarCategoria);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativa, setAtiva] = useState(true);

  useEffect(() => {
    if (!aberto) return;
    setNome(categoria?.nome ?? "");
    setDescricao(categoria?.descricao ?? "");
    setAtiva(categoria?.ativa ?? true);
  }, [aberto, categoria]);

  const invalidar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["categorias"] });
    await queryClient.invalidateQueries({ queryKey: ["categorias-revisao"] });
    await queryClient.invalidateQueries({ queryKey: ["faq-categories"] });
    await queryClient.invalidateQueries({ queryKey: ["faqs"] });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (categoria) {
        return atualizar({
          data: { id: categoria.id, nome: nome.trim(), descricao: descricao.trim(), ativa },
        });
      }
      return criar({ data: { nome: nome.trim(), descricao: descricao.trim() } });
    },
    onSuccess: async (resultado: unknown) => {
      await invalidar();
      const reindexar = (resultado as { reindexar?: number })?.reindexar ?? 0;
      if (reindexar > 0) {
        // Renomear reescreve o assunto dentro do texto que virou vetor. Sem
        // este aviso, a busca continuaria encontrando as perguntas pelo nome
        // antigo — sem erro em lugar nenhum.
        toast.success(
          `Categoria salva. ${reindexar} ${reindexar === 1 ? "pergunta precisa" : "perguntas precisam"} ser reindexada${reindexar === 1 ? "" : "s"} em Configurações.`,
        );
      } else {
        toast.success(categoria ? "Categoria atualizada" : "Categoria criada");
      }
      onOpenChange(false);
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar"),
  });

  const padronizar = useMutation({
    mutationFn: () => normalizar({ data: { id: categoria!.id } }),
    onSuccess: async (resultado) => {
      await invalidar();
      toast.success(
        resultado.ajustadas === 0
          ? "Nenhuma variante de grafia encontrada"
          : `${resultado.ajustadas} ${resultado.ajustadas === 1 ? "pergunta passou" : "perguntas passaram"} a usar "${categoria?.nome}". Reindexe em Configurações.`,
      );
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível padronizar"),
  });

  const valido = nome.trim().length >= 2;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{categoria ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          <DialogDescription>
            {categoria
              ? "Renomear reescreve o assunto de todas as perguntas que o usam."
              : "O nome entra na busca do chatbot como o assunto da pergunta."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categoria-nome">Nome</Label>
            <Input
              id="categoria-nome"
              value={nome}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Exames de sangue"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoria-descricao">Descrição</Label>
            <Textarea
              id="categoria-descricao"
              value={descricao}
              rows={3}
              maxLength={300}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que entra neste assunto, e o que não entra."
            />
          </div>

          {categoria && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!ativa}
                  onChange={(e) => setAtiva(!e.target.checked)}
                />
                <span>
                  Aposentar este assunto
                  <span className="block text-xs text-muted-foreground">
                    Some do formulário de FAQ, mas continua existindo — as perguntas que o usam
                    passam a aparecer em "precisa de revisão".
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Padronizar grafia</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reescreve "{categoria.nome.toLowerCase()}", "{categoria.nome.toUpperCase()}" e
                  variantes com acento para <strong>{categoria.nome}</strong>.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={padronizar.isPending}
                  onClick={() => padronizar.mutate()}
                >
                  <Wand2 className="size-4" />
                  {padronizar.isPending ? "Padronizando…" : "Padronizar agora"}
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!valido || salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : categoria ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BotaoExcluir({ categoria }: { categoria: Categoria }) {
  const queryClient = useQueryClient();
  const excluir = useServerFn(excluirCategoria);
  const [aberto, setAberto] = useState(false);

  const mutation = useMutation({
    mutationFn: () => excluir({ data: { id: categoria.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categorias"] });
      await queryClient.invalidateQueries({ queryKey: ["categorias-revisao"] });
      toast.success("Categoria excluída");
      setAberto(false);
    },
    // O backend recusa excluir assunto em uso e devolve a contagem na mensagem.
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível excluir"),
  });

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>
        Excluir
      </Button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{categoria.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Só é possível excluir assunto que nenhuma pergunta usa. Para aposentar um assunto em
              uso, edite-o e marque "aposentar".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
