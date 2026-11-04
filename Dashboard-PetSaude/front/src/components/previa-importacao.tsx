import { useMemo, useState } from "react";
import { AlertCircle, CopyCheck, Pencil } from "lucide-react";

import type { LinhaValidada } from "@/lib/import.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EstadoVazio } from "@/components/estado";
import { Segmentos } from "@/components/segmentos";
import { Selo } from "@/components/selo";
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

/**
 * Assunto que não fecha com a lista oficial.
 *
 * Anda junto do selo de estado, e não no lugar dele: a linha continua sendo
 * nova, duplicada ou inválida por conta própria, e o assunto é uma segunda
 * informação. Não bloqueia a importação, porque recusar o lote por causa da
 * taxonomia travaria a entrada de conteúdo até a equipe de saúde terminar a lista.
 */
function SeloAssunto() {
  return (
    <Selo tom="atencao" icone={<AlertCircle />}>
      Assunto fora da lista
    </Selo>
  );
}

function SelosDaLinha({ item }: { item: LinhaValidada }) {
  // "Parecida" é um estado `ok` com aviso: é importável, mas não deveria passar
  // despercebida. Sem selo próprio, ela se confundiria com uma pergunta nova.
  if (item.parecida) {
    return (
      <>
        <Selo tom="atencao" icone={<AlertCircle />}>
          Já existe parecida
        </Selo>
        {item.foraDaLista && <SeloAssunto />}
      </>
    );
  }

  // Os três estados precisam se distinguir de relance: é por eles que a pessoa
  // decide o que entra. Cada um tem tom e ícone próprios, para não depender só
  // da cor.
  const estado = item.estado;
  return (
    <>
      {estado === "ok" && <Selo tom="sucesso">{ROTULO.ok}</Selo>}
      {estado === "duplicada" && <Selo icone={<CopyCheck />}>{ROTULO.duplicada}</Selo>}
      {estado === "invalida" && (
        <Selo tom="erro" icone={<AlertCircle />}>
          {ROTULO.invalida}
        </Selo>
      )}
      {item.foraDaLista && <SeloAssunto />}
    </>
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
 * duas linhas com o mesmo content_hash: o banco não tem restrição de
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
    if (filtro === "problemas")
      return itens.filter((i) => i.estado !== "ok" || i.parecida || i.foraDaLista);
    if (filtro === "novas")
      return itens.filter((i) => i.estado === "ok" && !i.parecida && !i.foraDaLista);
    return itens;
  }, [itens, filtro]);

  const alternar = (linha: number, marcada: boolean) => {
    const nova = new Set(selecionadas);
    if (marcada) nova.add(linha);
    else nova.delete(linha);
    aoTrocarSelecao(nova);
  };

  const contagem = {
    ok: itens.filter((i) => i.estado === "ok" && !i.parecida && !i.foraDaLista).length,
    // "Com problema" junta o que merece um olhar antes de entrar. Assunto fora
    // da lista entra aqui pelo mesmo motivo que "parecida": é importável, mas
    // não deveria passar sem alguém ver.
    duplicadas: itens.filter(
      (i) => i.estado === "duplicada" || i.parecida || (i.estado === "ok" && i.foraDaLista),
    ).length,
    invalidas: itens.filter((i) => i.estado === "invalida").length,
  };

  return (
    <div className="space-y-4">
      <Segmentos
        rotulo="Mostrar"
        opcoes={[
          { valor: "todas", rotulo: `Todas (${itens.length})` },
          { valor: "novas", rotulo: `Novas (${contagem.ok})` },
          {
            valor: "problemas",
            rotulo: `Com problema (${contagem.duplicadas + contagem.invalidas})`,
          },
        ]}
        valor={filtro}
        aoMudar={setFiltro}
      />

      {visiveis.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma linha neste filtro"
          acao={
            <Button type="button" variant="outline" onClick={() => setFiltro("todas")}>
              Ver todas as linhas
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {visiveis.map((item) => {
            const podeMarcar = item.estado === "ok";
            return (
              <li
                key={item.linha}
                className="flex items-start gap-3 rounded-xl border bg-card p-3 sm:p-4"
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
                    <SelosDaLinha item={item} />
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
