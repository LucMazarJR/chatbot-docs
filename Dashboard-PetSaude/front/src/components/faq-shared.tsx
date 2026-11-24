import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { createFaq, deleteFaq, updateFaq, type Faq } from "@/lib/faq.functions";
import { listarCategorias } from "@/lib/categorias.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePode, usePodeEscrever, useSession } from "@/components/gate";
import { Checkbox } from "@/components/ui/checkbox";
import { diaIso } from "@/lib/datas";
import { PRAZOS, hoje, somarDias, textoDaRevisao } from "@/lib/revisao";
import { Selo } from "@/components/selo";
import { dataCurta } from "@/lib/datas";
import { cn } from "@/lib/utils";
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

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function faqCategories(faq: Faq) {
  const list = faq.categories?.length ? faq.categories : faq.category ? [faq.category] : [];
  return list.map((item) => item.trim()).filter(Boolean);
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, "")}
        className={cn("pl-10", inputClassName)}
      />
    </div>
  );
}

export function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Selo key={tag}>#{tag}</Selo>
      ))}
    </div>
  );
}

function ChipListField({
  label,
  hint,
  values,
  onChange,
  minCount,
  maxLength,
  placeholder,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
  minCount: number;
  maxLength: number;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={value}
              maxLength={maxLength}
              onChange={(e) =>
                onChange(values.map((item, i) => (i === index ? e.target.value : item)))
              }
              placeholder={`${placeholder} ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover"
              disabled={values.length <= minCount}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...values, ""])}>
        <Plus className="size-4" /> Adicionar
      </Button>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Escolha do assunto, a partir da lista oficial.
 *
 * LÓGICA DO LUCIANO: aqui era campo de texto livre, e é daí que vêm as 236
 * categorias distintas para 2491 FAQs. Cada pessoa digitava o assunto de novo, e
 * "Exames", "exames" e "Exames de sangue" viraram três temas diferentes para o
 * chatbot, que lê a categoria dentro do texto embedado.
 *
 * Dois casos que a lista não cobre, e que precisam continuar funcionando:
 *
 * 1. A lista começa VAZIA: quem a define é o pessoal da saúde. Enquanto não
 *    houver nenhuma categoria, o campo volta a ser texto livre, senão ninguém
 *    consegue cadastrar FAQ até a taxonomia existir.
 * 2. A FAQ sendo editada pode ter uma categoria que não está na lista (é o caso
 *    da maior parte da base hoje). O valor atual entra como opção, marcado, em
 *    vez de sumir, senão corrigir uma vírgula na resposta trocaria o assunto da
 *    pergunta sem ninguém pedir.
 */
function CampoCategoria({
  id,
  valor,
  onChange,
}: {
  id: string;
  valor: string;
  onChange: (valor: string) => void;
}) {
  const categoriasQuery = useQuery({
    queryKey: ["categorias", false],
    queryFn: () => listarCategorias({ data: { incluirInativas: false } }),
  });
  // Definir a lista é o editar de Categorias: quem não tem, recebe a frase de
  // a quem pedir, e não um link para uma tela onde não pode mudar nada.
  const podeDefinir = usePode("categorias", "editar");

  const oficiais = categoriasQuery.data?.categorias ?? [];
  const listaVazia = !categoriasQuery.isLoading && oficiais.length === 0;
  const foraDaLista = Boolean(valor) && !oficiais.some((c) => c.nome === valor);

  if (listaVazia) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>Categoria</Label>
        <Input
          id={id}
          value={valor}
          maxLength={60}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex.: Exames"
        />
        <p className="text-xs text-muted-foreground">
          Nenhuma categoria cadastrada ainda.{" "}
          {podeDefinir ? (
            <>
              <Link to="/categorias" className="underline underline-offset-2">
                Defina a lista de assuntos
              </Link>{" "}
              para escolher em vez de digitar.
            </>
          ) : (
            "Quem cuida das Categorias define a lista, e aí dá para escolher em vez de digitar."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Categoria</Label>
      <Select value={valor || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Escolha o assunto" />
        </SelectTrigger>
        <SelectContent>
          {foraDaLista && (
            <SelectItem value={valor}>{valor} (fora da lista)</SelectItem>
          )}
          {oficiais.map((categoria) => (
            <SelectItem key={categoria.id} value={categoria.nome}>
              {categoria.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {foraDaLista
          ? "Este assunto não está na lista oficial. Escolher outro corrige a pergunta."
          : "A lista é definida pela equipe de saúde, em Categorias."}
      </p>
    </div>
  );
}

/**
 * "Precisa de revisão": a data em que alguém confere se a FAQ continua valendo.
 *
 * Para o que vale por um tempo (um surto, uma campanha, um horário de férias).
 * O chatbot continua respondendo depois da data: ela põe a FAQ na lista de
 * Revisões, e não tira do ar.
 */
export function CampoRevisao({
  id,
  ativo,
  aoAtivar,
  data,
  aoMudarData,
  nota,
  aoMudarNota,
}: {
  id: string;
  ativo: boolean;
  aoAtivar: (ativo: boolean) => void;
  data: string;
  aoMudarData: (data: string) => void;
  nota: string;
  aoMudarNota: (nota: string) => void;
}) {
  const passou = ativo && data !== "" && data < hoje();
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <Label htmlFor={`${id}-ativo`} className="flex min-h-11 cursor-pointer items-start gap-3">
        <Checkbox
          id={`${id}-ativo`}
          checked={ativo}
          onCheckedChange={(v) => aoAtivar(v === true)}
          className="mt-0.5"
        />
        <span>
          <span className="block font-semibold">Precisa de revisão em uma data</span>
          <span className="block text-sm font-normal text-muted-foreground">
            Para o que vale por um tempo, como um surto ou uma campanha. O chatbot continua
            respondendo depois da data; a FAQ entra na lista de Revisões.
          </span>
        </span>
      </Label>

      {ativo && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${id}-data`}>Revisar em</Label>
            <Input
              id={`${id}-data`}
              type="date"
              value={data}
              min={passou ? undefined : hoje()}
              onChange={(e) => aoMudarData(e.target.value)}
              className="w-auto"
            />
            <div className="flex flex-wrap gap-2">
              {PRAZOS.map((prazo) => (
                <Button
                  key={prazo.dias}
                  type="button"
                  variant="secondary"
                  onClick={() => aoMudarData(somarDias(hoje(), prazo.dias))}
                >
                  {prazo.rotulo}
                </Button>
              ))}
            </div>
            {data === "" ? (
              <p className="text-sm font-semibold text-destructive">
                Escolha a data da revisão, ou desmarque se a FAQ não precisa.
              </p>
            ) : passou ? (
              <p className="text-sm font-semibold text-warning">
                {textoDaRevisao(data)}. Marque a próxima data, ou desmarque se não precisa mais.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{textoDaRevisao(data)}.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-nota`}>Motivo (opcional)</Label>
            <Input
              id={`${id}-nota`}
              value={nota}
              maxLength={200}
              onChange={(e) => aoMudarNota(e.target.value)}
              placeholder="Ex.: surto de Hepatite A em Franca"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** O que o formulário de FAQ grava. */
export type DadosFaq = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source: string;
  /** "AAAA-MM-DD", ou null quando não precisa de revisão. */
  revisar_em: string | null;
  revisao_nota: string | null;
};

export function FaqFormDialog({
  mode,
  faq,
  open,
  onOpenChange,
  defaultCategory,
  aprovacao,
  aviso,
}: {
  mode: "create" | "edit";
  faq?: Faq;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: string;
  /**
   * O mesmo formulário para aprovar uma sugestão da curadoria. Começa com o
   * rascunho do modelo, e quem grava é a rota de aprovar, que também fecha a
   * sugestão e guarda o rastro até as conversas de origem. Era um formulário à
   * parte, sem Referência e com as tags num campo só, e a FAQ aprovada saía
   * diferente da criada à mão.
   */
  aprovacao?: {
    inicial: Partial<DadosFaq>;
    salvar: (dados: DadosFaq) => Promise<{ semEmbedding?: boolean }>;
  };
  /** Frase no topo do formulário, como "esta FAQ ainda não venceu". */
  aviso?: string;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createFaq);
  const update = useServerFn(updateFaq);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>(["", "", ""]);
  const [source, setSource] = useState("");
  const [revisar, setRevisar] = useState(false);
  const [revisarEm, setRevisarEm] = useState("");
  const [revisaoNota, setRevisaoNota] = useState("");
  // O padrão de Minha conta: FAQ nova já vem com a revisão marcada.
  const padraoDias = useSession().usuario?.revisaoPadraoDias ?? null;

  // LÓGICA DO LUCIANO: os ids eram estáticos ("faq-question"), e este diálogo é
  // renderizado uma vez POR CARD da lista. Numa página de 20 FAQs havia 20
  // elementos com o mesmo id, e clicar no rótulo focava o campo do primeiro
  // card, não o do formulário aberto. `useId` dá um prefixo único por instância.
  const uid = useId();
  const idDe = (campo: string) => `${uid}-${campo}`;

  useEffect(() => {
    if (!open) return;
    // Revisão: a da FAQ, quando editando; o padrão da pessoa, quando é nova.
    const dataAtual = faq?.revisar_em ? diaIso(faq.revisar_em) : "";
    const comPadrao = mode === "create" && padraoDias !== null;
    setRevisar(Boolean(dataAtual) || comPadrao);
    setRevisarEm(dataAtual || (comPadrao ? somarDias(hoje(), padraoDias) : ""));
    setRevisaoNota(faq?.revisao_nota ?? "");
    if (aprovacao) {
      setQuestion(aprovacao.inicial.question ?? "");
      setAnswer(aprovacao.inicial.answer ?? "");
      setCategory(aprovacao.inicial.category ?? "");
      const sugeridas = aprovacao.inicial.tags ?? [];
      setTags(sugeridas.length >= 3 ? sugeridas : [...sugeridas, "", "", ""].slice(0, 3));
      setSource(aprovacao.inicial.source ?? "");
      return;
    }
    setQuestion(faq?.question ?? "");
    setAnswer(faq?.answer ?? "");
    setCategory(faq ? (faqCategories(faq)[0] ?? "") : (defaultCategory ?? ""));
    const initialTags = faq?.tags ?? [];
    setTags(initialTags.length >= 3 ? initialTags : [...initialTags, "", "", ""].slice(0, 3));
    setSource(faq?.source ?? "");
    // `aprovacao` fica de fora de propósito: é um objeto novo a cada render da
    // tela, e o formulário recomeçaria do rascunho enquanto a pessoa digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, faq, defaultCategory]);

  const cleanCategory = category.trim();
  const cleanTags = tags.map((item) => item.trim()).filter(Boolean);
  const valid =
    question.trim().length >= 5 &&
    answer.trim().length >= 5 &&
    cleanCategory.length >= 2 &&
    cleanTags.length >= 3 &&
    (!revisar || revisarEm !== "");

  const mutation = useMutation({
    mutationFn: async (): Promise<{ semEmbedding?: boolean } | unknown> => {
      const payload = {
        question,
        answer,
        category: cleanCategory,
        tags: cleanTags,
        source: source.trim(),
        revisar_em: revisar ? revisarEm : null,
        revisao_nota: revisar ? revisaoNota.trim() || null : null,
      };
      if (aprovacao) return aprovacao.salvar(payload);
      if (mode === "edit" && faq) return update({ data: { ...payload, id: faq.id } });
      return create({ data: payload });
    },
    onSuccess: async (resultado) => {
      if (aprovacao) {
        await queryClient.invalidateQueries({ queryKey: ["curadoria-sugestoes"] });
      }
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      await queryClient.invalidateQueries({ queryKey: ["revisoes"] });
      await queryClient.invalidateQueries({ queryKey: ["revisoes-contagem"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      // As duas telas de categoria contam FAQs, e a de revisão classifica por
      // assunto: criar ou recategorizar uma pergunta muda as duas.
      await queryClient.invalidateQueries({ queryKey: ["faq-categories"] });
      await queryClient.invalidateQueries({ queryKey: ["categorias-revisao"] });
      const semEmbedding = (resultado as { semEmbedding?: boolean } | undefined)?.semEmbedding;
      toast.success(
        aprovacao
          ? semEmbedding
            ? "FAQ criada, mas sem preparo para a busca: reindexe em Configurações."
            : "FAQ criada a partir da sugestão"
          : mode === "edit"
            ? "Pergunta atualizada"
            : "Pergunta criada",
      );
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {aprovacao ? "Revisar e criar FAQ" : mode === "edit" ? "Editar FAQ" : "Nova FAQ"}
            </DialogTitle>
            <DialogDescription>
              {aprovacao
                ? "Confira o rascunho antes de aprovar: quem assina a FAQ é você. Uma categoria e ao menos 3 tags."
                : "Uma categoria e ao menos 3 tags. A revisão por data é opcional."}
            </DialogDescription>
          </DialogHeader>

          {aviso && (
            <p className="rounded-lg bg-warning-soft p-3 text-[15px] text-foreground">{aviso}</p>
          )}

          <form
            id={idDe("form")}
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              // LÓGICA DO LUCIANO: aqui abria um segundo diálogo de confirmação
              // por cima deste. Editar é reversível e já passou por um modal;
              // eram 7 passos para corrigir uma letra numa resposta. Confirmar
              // continua fazendo sentido para EXCLUIR, que é o que não volta.
              //
              // O toast que existia neste ponto era código morto: o botão fica
              // `disabled` quando o formulário é inválido, então o submit nunca
              // disparava. A validação agora aparece ao lado dos campos.
              mutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={idDe("question")}>Pergunta</Label>
              <Input
                id={idDe("question")}
                value={question}
                maxLength={300}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ex.: Preciso de jejum para o exame de sangue?"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={idDe("answer")}>Resposta</Label>
              <Textarea
                id={idDe("answer")}
                value={answer}
                rows={6}
                maxLength={4000}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Escreva a orientação completa…"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={idDe("source")}>Referência</Label>
              <Input
                id={idDe("source")}
                value={source}
                maxLength={300}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Ex.: Cartilha do Ministério da Saúde"
              />
            </div>

            <CampoCategoria id={idDe("category")} valor={category} onChange={setCategory} />

            <ChipListField
              label="Tags (mínimo 3)"
              hint="As tags ajudam na busca. Use termos como “jejum”, “vacina”, “consulta”."
              values={tags}
              onChange={setTags}
              minCount={3}
              maxLength={30}
              placeholder="Tag"
            />

            <CampoRevisao
              id={idDe("revisao")}
              ativo={revisar}
              aoAtivar={(ativo) => {
                setRevisar(ativo);
                // Ao marcar, já sugere uma data: o padrão da pessoa, ou 3 meses.
                if (ativo && !revisarEm) setRevisarEm(somarDias(hoje(), padraoDias ?? 90));
              }}
              data={revisarEm}
              aoMudarData={setRevisarEm}
              nota={revisaoNota}
              aoMudarNota={setRevisaoNota}
            />
          </form>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form={idDe("form")} disabled={mutation.isPending || !valid}>
              {mutation.isPending
                ? "Salvando…"
                : aprovacao
                  ? "Aprovar e criar FAQ"
                  : mode === "edit"
                    ? "Salvar alterações"
                    : "Criar pergunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Editar e excluir uma FAQ, com os diálogos de cada um.
 *
 * Mora fora do cartão porque a lista em colunas e a página da pergunta usam os
 * mesmos botões. Quem só tem leitura não vê nada: a garantia de verdade está
 * no backend, que exige admin ou editor para escrever, e isto evita oferecer
 * uma ação que terminaria em 403.
 */
export function AcoesDaFaq({ faq, className }: { faq: Faq; className?: string }) {
  const podeEscrever = usePodeEscrever();
  const queryClient = useQueryClient();
  const remove = useServerFn(deleteFaq);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => remove({ data: { id: faq.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast.success("Pergunta excluída");
      setDeleting(false);
    },
    onError: (error: Error) =>
      toast.error(
        error.message || "Não foi possível excluir. Confira a internet e tente de novo.",
      ),
  });

  if (!podeEscrever) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Editar: ${faq.question}`}
        title="Editar"
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Excluir: ${faq.question}`}
        title="Excluir"
        className="text-destructive hover:bg-destructive-soft hover:text-destructive"
        onClick={() => setDeleting(true)}
      >
        <Trash2 />
      </Button>

      <FaqFormDialog mode="edit" faq={faq} open={editing} onOpenChange={setEditing} />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta pergunta?</AlertDialogTitle>
            <AlertDialogDescription>
              “{faq.question}” sai da base, e o chatbot deixa de usá-la para responder. Não
              dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A pergunta inteira: resposta, fonte, tags e quem mexeu. */
/**
 * A revisão da FAQ, quando tem: "Vence em 12 dias", em amarelo depois de vencer.
 * O motivo vai no title, e por extenso no cartão da pergunta.
 */
export function SeloRevisao({ faq }: { faq: Faq }) {
  if (!faq.revisar_em) return null;
  return (
    <Selo
      tom={faq.situacao_revisao === "vencida" ? "atencao" : "neutro"}
      title={faq.revisao_nota ?? undefined}
    >
      {textoDaRevisao(faq.revisar_em)}
    </Selo>
  );
}

export function FaqCard({ faq, compact = false }: { faq: Faq; compact?: boolean }) {
  const categories = faqCategories(faq);

  return (
    <li className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {(categories.length > 0 || faq.revisar_em) && (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Selo key={category} tom="marca">
                  {category}
                </Selo>
              ))}
              <SeloRevisao faq={faq} />
            </div>
          )}
          <h3 className="mt-2 break-words text-base font-semibold">{faq.question}</h3>
          <p
            className={
              compact
                ? "mt-1 line-clamp-3 break-words text-[15px] text-muted-foreground"
                : "mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed text-muted-foreground"
            }
          >
            {faq.answer}
          </p>
          {faq.source && (
            <p className="mt-2 break-words text-sm font-semibold text-muted-foreground">
              Fonte: {faq.source}
            </p>
          )}
          <TagRow tags={faq.tags} />
          {faq.revisar_em && (faq.revisao_nota || faq.revisada_por) && (
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {faq.revisao_nota ? `Revisão: ${faq.revisao_nota}` : ""}
              {faq.revisao_nota && faq.revisada_por ? " · " : ""}
              {faq.revisada_por && faq.revisada_em
                ? `revisada por ${faq.revisada_por} em ${dataCurta(faq.revisada_em)}`
                : ""}
            </p>
          )}
          <p className="mt-3 text-[13px] text-muted-foreground">
            {faq.updated_by ? `Última alteração por ${faq.updated_by}` : "Sem registro de autor"}
            {faq.created_by ? ` · criada por ${faq.created_by}` : ""}
            {faq.updatedAt ? ` · ${dataCurta(faq.updatedAt)}` : ""}
          </p>
        </div>
        <AcoesDaFaq faq={faq} />
      </div>
    </li>
  );
}

/**
 * Uma pergunta como linha da lista: pergunta e começo da resposta, assunto,
 * data e as ações.
 *
 * LÓGICA DO LUCIANO: a lista mostrava cada FAQ como cartão completo, com a
 * resposta inteira, a fonte e as tags. Cabiam duas por tela, e achar uma
 * pergunta era rolar. Em colunas cabem dez, e o detalhe está a um clique na
 * página da pergunta.
 */
export function FaqLinha({ faq }: { faq: Faq }) {
  const [assunto, ...outros] = faqCategories(faq);

  return (
    <li className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-surface-2 sm:px-5 md:grid-cols-[minmax(0,1fr)_190px_120px_96px]">
      <div className="col-span-2 min-w-0 md:col-span-1">
        <Link
          to="/faqs/$id"
          params={{ id: faq.id }}
          className="block break-words text-base font-semibold leading-snug text-foreground hover:underline"
        >
          {faq.question}
        </Link>
        <span className="mt-1 block truncate text-sm text-muted-foreground">{faq.answer}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {assunto ? (
          <Selo tom="marca" className="max-w-full truncate" title={assunto}>
            {assunto}
          </Selo>
        ) : (
          <span className="text-sm text-muted-foreground">sem assunto</span>
        )}
        {outros.length > 0 && (
          <span className="text-sm text-muted-foreground" title={outros.join(", ")}>
            +{outros.length}
          </span>
        )}
        <SeloRevisao faq={faq} />
        {/* No celular a data vai junto do assunto; a coluna própria some. */}
        {faq.updatedAt && (
          <span className="text-sm text-muted-foreground md:hidden">
            {dataCurta(faq.updatedAt)}
          </span>
        )}
      </div>
      <span className="hidden text-[15px] text-muted-foreground md:block">
        {faq.updatedAt ? dataCurta(faq.updatedAt) : "sem data"}
      </span>
      {/* No desktop os botões aparecem ao passar o mouse ou chegar pelo
          teclado; sempre visíveis, vinte linhas de lápis e lixeira viram ruído. */}
      <AcoesDaFaq
        faq={faq}
        className="justify-end md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      />
    </li>
  );
}

export function InsertFaqButton({
  defaultCategory,
  label = "Inserir",
}: {
  defaultCategory?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const podeEscrever = usePodeEscrever();

  if (!podeEscrever) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <FaqFormDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
        defaultCategory={defaultCategory}
      />
    </>
  );
}
