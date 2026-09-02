import { useMemo, useState } from "react";
import { AlertCircle, CopyCheck, Pencil } from "lucide-react";

import type { LinhaValidada } from "@/lib/import.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type FaqEditavel = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source: string;
  linha: number;
};

type Filtro = "todas" | "problemas" | "novas";

const ROTULO: Record<LinhaValidada["estado"], string> = {
  ok: "Nova",
  duplicada: "Já existe",
  invalida: "Com problema",
};

function Selo({ item }: { item: LinhaValidada }) {
  // "Parecida" e um estado `ok` com aviso: e importavel, mas nao deveria passar
  // despercebida. Sem selo proprio, ela se confundiria com uma pergunta nova.
  if (item.parecida) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
        <AlertCircle className="mr-1 size-3" />
        Já existe parecida
      </span>
    );
  }

  const estado = item.estado;
  // Os tres estados precisam se distinguir de relance: e por eles que a pessoa
  // decide o que entra. O "ja existe" era bg-muted sem borda sobre um cartao
  // branco, ou seja, um retangulo invisivel -- dos tres, so dois apareciam.
  const classe =
    estado === "ok"
      ? "border border-success/30 bg-success/10 text-success"
      : estado === "duplicada"
        ? "border border-border bg-muted text-muted-foreground"
        : "border border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${classe}`}
    >
      {estado === "duplicada" && <CopyCheck className="mr-1 size-3" />}
      {estado === "invalida" && <AlertCircle className="mr-1 size-3" />}
      {ROTULO[estado]}
    </span>
  );
}

function DialogoEdicao({
  item,
  aberto,
  aoFechar,
  aoSalvar,
}: {
  item: LinhaValidada | null;
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (linha: number, faq: FaqEditavel) => void;
}) {
  // Os valores iniciais bastam porque o pai passa `key={linha}`: trocar de
  // linha remonta o componente. Sem essa chave, seria preciso sincronizar por
  // efeito, e os campos de uma linha vazariam para a próxima aberta.
  const [question, setQuestion] = useState(item?.faq.question ?? "");
  const [answer, setAnswer] = useState(item?.faq.answer ?? "");
  const [category, setCategory] = useState(item?.faq.category ?? "");
  const [tags, setTags] = useState(item?.faq.tags.join(", ") ?? "");
  const [source, setSource] = useState(item?.faq.source ?? "");

  if (!item) return null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Corrigir a linha {item.linha}</DialogTitle>
          <DialogDescription>
            {item.motivos.length > 0
              ? item.motivos.join(" ")
              : "A correção vale só para esta importação. O arquivo original não muda."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-question">Pergunta</Label>
            <Input
              id="edit-question"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-answer">Resposta</Label>
            <Textarea
              id="edit-answer"
              value={answer}
              rows={5}
              maxLength={4000}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-category">Assunto</Label>
              <Input
                id="edit-category"
                value={category}
                maxLength={60}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-source">Fonte</Label>
              <Input
                id="edit-source"
                value={source}
                maxLength={300}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">Tags (separadas por vírgula, mínimo 3)</Label>
            <Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() =>
              aoSalvar(item.linha, {
                question,
                answer,
                category,
                tags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                source,
                linha: item.linha,
              })
            }
          >
            Aplicar e conferir de novo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A prévia da importação.
 *
 * LÓGICA DO LUCIANO: duplicadas e inválidas vêm DESMARCADAS e não podem ser
 * marcadas. Deixar marcar uma duplicada seria oferecer um jeito fácil de criar
 * duas linhas com o mesmo content_hash — o banco não tem restrição de
 * unicidade nesse campo, e a cópia só apareceria quando alguém estranhasse a
 * contagem. Para reimportar algo que já existe, o caminho é editar a linha até
 * ela ser outra pergunta, e a edição está aqui do lado.
 */
export function PreviaImportacao({
  itens,
  selecionadas,
  aoTrocarSelecao,
  aoEditar,
  desabilitado,
}: {
  itens: LinhaValidada[];
  selecionadas: Set<number>;
  aoTrocarSelecao: (selecionadas: Set<number>) => void;
  aoEditar: (linha: number, faq: FaqEditavel) => void;
  desabilitado?: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [editando, setEditando] = useState<LinhaValidada | null>(null);

  const visiveis = useMemo(() => {
    if (filtro === "problemas") return itens.filter((i) => i.estado !== "ok" || i.parecida);
    if (filtro === "novas") return itens.filter((i) => i.estado === "ok" && !i.parecida);
    return itens;
  }, [itens, filtro]);

  const alternar = (linha: number, marcada: boolean) => {
    const nova = new Set(selecionadas);
    if (marcada) nova.add(linha);
    else nova.delete(linha);
    aoTrocarSelecao(nova);
  };

  const contagem = {
    ok: itens.filter((i) => i.estado === "ok" && !i.parecida).length,
    duplicadas: itens.filter((i) => i.estado === "duplicada" || i.parecida).length,
    invalidas: itens.filter((i) => i.estado === "invalida").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["todas", `Todas (${itens.length})`],
            ["novas", `Novas (${contagem.ok})`],
            ["problemas", `Com problema (${contagem.duplicadas + contagem.invalidas})`],
          ] as [Filtro, string][]
        ).map(([valor, rotulo]) => (
          <Button
            key={valor}
            type="button"
            size="sm"
            variant={filtro === valor ? "default" : "outline"}
            onClick={() => setFiltro(valor)}
          >
            {rotulo}
          </Button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma linha neste filtro.
        </p>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((item) => {
            const podeMarcar = item.estado === "ok";
            return (
              <li
                key={item.linha}
                className="flex items-start gap-3 rounded-lg border border-border panel-surface p-3 sm:p-4"
              >
                <Checkbox
                  className="mt-1 shrink-0"
                  checked={selecionadas.has(item.linha)}
                  disabled={!podeMarcar || desabilitado}
                  aria-label={`Incluir a linha ${item.linha}`}
                  onCheckedChange={(v) => alternar(item.linha, v === true)}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">linha {item.linha}</span>
                    <Selo item={item} />
                    {item.faq.category && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.faq.category}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 break-words text-sm font-medium">
                    {item.faq.question || (
                      <span className="text-muted-foreground">(sem pergunta)</span>
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                    {item.faq.answer || "(sem resposta)"}
                  </p>

                  {item.faq.tags.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.faq.tags.map((t) => `#${t}`).join(" ")}
                    </p>
                  )}

                  {item.motivos.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {item.motivos.map((motivo, i) => (
                        <li
                          key={i}
                          className={
                            item.estado === "invalida"
                              ? "text-xs text-destructive"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          {motivo}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`Corrigir a linha ${item.linha}`}
                  disabled={desabilitado}
                  onClick={() => setEditando(item)}
                >
                  <Pencil className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <DialogoEdicao
        key={editando?.linha ?? "nenhuma"}
        item={editando}
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        aoSalvar={(linha, faq) => {
          aoEditar(linha, faq);
          setEditando(null);
        }}
      />
    </div>
  );
}
