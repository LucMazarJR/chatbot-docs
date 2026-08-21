import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { createFaq, deleteFaq, updateFaq, type Faq } from "@/lib/faq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePodeEscrever } from "@/components/gate";
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
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

export function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
        >
          #{tag}
        </span>
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

export function FaqFormDialog({
  mode,
  faq,
  open,
  onOpenChange,
  defaultCategory,
}: {
  mode: "create" | "edit";
  faq?: Faq;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: string;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createFaq);
  const update = useServerFn(updateFaq);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [categories, setCategories] = useState<string[]>([""]);
  const [tags, setTags] = useState<string[]>(["", "", ""]);
  const [source, setSource] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion(faq?.question ?? "");
    setAnswer(faq?.answer ?? "");
    const initialCategories = faq ? faqCategories(faq) : defaultCategory ? [defaultCategory] : [];
    setCategories(initialCategories.length ? initialCategories : [""]);
    const initialTags = faq?.tags ?? [];
    setTags(initialTags.length >= 3 ? initialTags : [...initialTags, "", "", ""].slice(0, 3));
    setSource(faq?.source ?? "");
    setConfirming(false);
  }, [open, faq, defaultCategory]);

  const cleanCategories = categories.map((item) => item.trim()).filter(Boolean);
  const cleanTags = tags.map((item) => item.trim()).filter(Boolean);
  const valid =
    question.trim().length >= 5 &&
    answer.trim().length >= 5 &&
    cleanCategories.length >= 1 &&
    cleanTags.length >= 3;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        question,
        answer,
        categories: cleanCategories,
        tags: cleanTags,
        source: source.trim(),
      };
      if (mode === "edit" && faq) return update({ data: { ...payload, id: faq.id } });
      return create({ data: payload });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast.success(mode === "edit" ? "FAQ atualizada" : "FAQ criada");
      setConfirming(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setConfirming(false);
      toast.error(error.message || "Não foi possível salvar");
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Editar FAQ" : "Nova FAQ"}</DialogTitle>
            <DialogDescription>
              Ao menos 1 categoria e 3 tags. Você pode adicionar quantas quiser.
            </DialogDescription>
          </DialogHeader>

          <form
            id="faq-form"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) {
                toast.error("Preencha pergunta, resposta, 1+ categoria e 3+ tags");
                return;
              }
              setConfirming(true);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="faq-question">Pergunta</Label>
              <Input
                id="faq-question"
                value={question}
                maxLength={300}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ex.: Preciso de jejum para o exame de sangue?"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="faq-answer">Resposta</Label>
              <Textarea
                id="faq-answer"
                value={answer}
                rows={6}
                maxLength={4000}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Escreva a orientação completa…"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="faq-source">Referência</Label>
              <Input
                id="faq-source"
                value={source}
                maxLength={300}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Ex.: Cartilha do Ministério da Saúde"
              />
            </div>

            <ChipListField
              label="Categorias (mínimo 1)"
              hint="Uma pergunta pode pertencer a várias categorias."
              values={categories}
              onChange={setCategories}
              minCount={1}
              maxLength={60}
              placeholder="Categoria"
            />

            <ChipListField
              label="Tags (mínimo 3)"
              hint="As tags ajudam na busca — use termos como “jejum”, “vacina”, “consulta”."
              values={tags}
              onChange={setTags}
              minCount={3}
              maxLength={30}
              placeholder="Tag"
            />
          </form>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="faq-form" disabled={mutation.isPending || !valid}>
              {mode === "edit" ? "Salvar alterações" : "Criar FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === "edit" ? "Confirmar as alterações?" : "Confirmar a nova pergunta?"}
            </AlertDialogTitle>
            <AlertDialogDescription>“{question.trim()}”</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Salvando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function FaqCard({ faq, compact = false }: { faq: Faq; compact?: boolean }) {
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
      toast.success("FAQ excluída");
      setDeleting(false);
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível excluir"),
  });

  const categories = faqCategories(faq);

  return (
    <li className="rounded-2xl border border-border panel-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {category}
                </span>
              ))}
            </div>
          )}
          <h3 className="mt-2 text-base font-semibold">{faq.question}</h3>
          <p
            className={
              compact
                ? "mt-1 line-clamp-3 text-sm text-muted-foreground"
                : "mt-2 whitespace-pre-line text-sm text-muted-foreground"
            }
          >
            {faq.answer}
          </p>
          {faq.source && <p className="mt-1 text-sm text-muted-foreground font-semibold">Fonte: {faq.source}</p>}
          <TagRow tags={faq.tags} />
          <p className="mt-2 text-xs text-muted-foreground">
            {faq.updated_by ? `Última alteração por ${faq.updated_by}` : "Sem registro de autor"}
            {faq.created_by ? ` · criada por ${faq.created_by}` : ""}
          </p>
        </div>
        {/* Quem só tem leitura não vê os botões. A garantia de verdade está
            no backend, que exige papel admin ou editor para escrever — isto
            aqui evita oferecer uma ação que resultaria em 403. */}
        {podeEscrever && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Editar pergunta"
              title="Editar"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir pergunta"
              title="Excluir"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <FaqFormDialog mode="edit" faq={faq} open={editing} onOpenChange={setEditing} />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja realmente excluir?</AlertDialogTitle>
            <AlertDialogDescription>
              “{faq.question}” será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Excluindo…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <Plus className="size-4" /> {label}
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