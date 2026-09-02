import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEM_CATEGORIA, type Origem, type Situacao } from "@/lib/faq.functions";

/** Sentinela do Select: Radix não aceita item de valor vazio. */
const TODOS = "__todos__";

export type ValoresFiltro = {
  category: string;
  tag: string;
  autor: string;
  origem: Origem | "";
  situacao: Situacao | "";
  de: string;
  ate: string;
};

export const FILTRO_VAZIO: ValoresFiltro = {
  category: "",
  tag: "",
  autor: "",
  origem: "",
  situacao: "",
  de: "",
  ate: "",
};

const ORIGENS: { valor: Origem; rotulo: string }[] = [
  { valor: "manual", rotulo: "Cadastradas aqui" },
  { valor: "importada", rotulo: "Importadas de arquivo" },
  { valor: "drive", rotulo: "Vindas do Google Drive" },
];

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "ativas", rotulo: "Só as ativas" },
  { valor: "inativas", rotulo: "Só as excluídas" },
  { valor: "todas", rotulo: "Ativas e excluídas" },
];

export function contarFiltrosAtivos(v: ValoresFiltro): number {
  return Object.values(v).filter(Boolean).length;
}

/**
 * Painel de filtros da listagem.
 *
 * LÓGICA DO LUCIANO: recolhido por padrão e com a contagem de filtros ativos no
 * botão. Sete controles sempre visíveis empurrariam a lista para baixo da dobra
 * no celular, e o problema real não é achar o filtro: é lembrar que ele está
 * ligado. A contagem no botão resolve isso mesmo com o painel fechado, que é
 * quando a pessoa se pergunta por que a lista está estranha.
 */
export function FiltrosFaq({
  aberto,
  aoAlternar,
  valores,
  aoMudar,
  aoLimpar,
  categorias,
}: {
  aberto: boolean;
  aoAlternar: () => void;
  valores: ValoresFiltro;
  aoMudar: (parcial: Partial<ValoresFiltro>) => void;
  aoLimpar: () => void;
  categorias: { category: string; count: number }[];
}) {
  const ativos = contarFiltrosAtivos(valores);

  return (
    <section className="rounded-lg border border-border panel-surface">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={aberto}
          aria-controls="painel-filtros"
          onClick={aoAlternar}
        >
          <Filter className="size-4" /> Filtros
          {ativos > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
              {ativos}
            </span>
          )}
        </Button>

        {ativos > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={aoLimpar}>
            <X className="size-4" /> Limpar
          </Button>
        )}
      </div>

      {aberto && (
        <div
          id="painel-filtros"
          className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="filtro-categoria">Assunto</Label>
            <Select
              value={valores.category || TODOS}
              onValueChange={(v) => aoMudar({ category: v === TODOS ? "" : v })}
            >
              <SelectTrigger id="filtro-categoria" className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os assuntos</SelectItem>
                {categorias.map((c) => (
                  <SelectItem
                    key={c.category}
                    value={c.category === "Sem categoria" ? SEM_CATEGORIA : c.category}
                  >
                    {c.category} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filtro-tag">Tag</Label>
            <Input
              id="filtro-tag"
              value={valores.tag}
              autoComplete="off"
              placeholder="Ex.: jejum"
              onChange={(e) => aoMudar({ tag: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filtro-autor">Quem cadastrou ou alterou</Label>
            <Input
              id="filtro-autor"
              value={valores.autor}
              autoComplete="off"
              placeholder="Nome da pessoa"
              onChange={(e) => aoMudar({ autor: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filtro-origem">De onde veio</Label>
            <Select
              value={valores.origem || TODOS}
              onValueChange={(v) => aoMudar({ origem: v === TODOS ? "" : (v as Origem) })}
            >
              <SelectTrigger id="filtro-origem" className="w-full">
                <SelectValue placeholder="Qualquer origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Qualquer origem</SelectItem>
                {ORIGENS.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filtro-situacao">Situação</Label>
            <Select
              value={valores.situacao || TODOS}
              onValueChange={(v) => aoMudar({ situacao: v === TODOS ? "" : (v as Situacao) })}
            >
              <SelectTrigger id="filtro-situacao" className="w-full">
                <SelectValue placeholder="Só as ativas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Só as ativas</SelectItem>
                {SITUACOES.map((s) => (
                  <SelectItem key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-de">Alterada de</Label>
              <Input
                id="filtro-de"
                type="date"
                value={valores.de}
                onChange={(e) => aoMudar({ de: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filtro-ate">até</Label>
              <Input
                id="filtro-ate"
                type="date"
                value={valores.ate}
                onChange={(e) => aoMudar({ ate: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
