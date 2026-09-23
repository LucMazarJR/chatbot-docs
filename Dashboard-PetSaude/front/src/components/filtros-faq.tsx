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

/**
 * LÓGICA DO LUCIANO: "ativas" NÃO entra nesta lista, apesar de existir no
 * contrato da API. O padrão da listagem já é mostrar só as ativas, então o item
 * sentinela e a opção "ativas" fariam exatamente a mesma coisa, e o select
 * aparecia com "Só as ativas" escrito duas vezes, uma marcada e outra não.
 * Duas opções idênticas num filtro é pior que uma opção a menos: a pessoa fica
 * procurando a diferença.
 */
const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "inativas", rotulo: "Só as excluídas" },
  { valor: "todas", rotulo: "Ativas e excluídas" },
];

export function contarFiltrosAtivos(v: ValoresFiltro): number {
  return Object.values(v).filter(Boolean).length;
}

/**
 * Converte a data do campo (AAAA-MM-DD) no instante correspondente no fuso de
 * quem está usando o sistema.
 *
 * LÓGICA DO LUCIANO: quem monta as pontas é o navegador, porque só ele sabe o
 * fuso da pessoa. O servidor roda em UTC; se ele tentasse deduzir o dia a partir
 * da data solta, "de 10/03 até 10/03" no Brasil viraria um intervalo que começa
 * às 21h do dia 9.
 */
export function inicioDoDia(data: string): string | undefined {
  if (!data) return undefined;
  const [a, m, d] = data.split("-").map(Number);
  return new Date(a, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function fimDoDia(data: string): string | undefined {
  if (!data) return undefined;
  const [a, m, d] = data.split("-").map(Number);
  return new Date(a, m - 1, d, 23, 59, 59, 999).toISOString();
}

/**
 * O assunto, na própria barra de busca.
 *
 * É o filtro que a equipe mais usa, então fica à vista, e não dentro de
 * "Mais filtros".
 */
export function SeletorAssunto({
  valor,
  aoMudar,
  categorias,
}: {
  valor: string;
  aoMudar: (categoria: string) => void;
  categorias: { category: string; count: number }[];
}) {
  return (
    <Select value={valor || TODOS} onValueChange={(v) => aoMudar(v === TODOS ? "" : v)}>
      <SelectTrigger
        aria-label="Filtrar por assunto"
        className="w-full gap-2 sm:w-auto sm:min-w-44 sm:max-w-64"
      >
        <span className="shrink-0 text-muted-foreground">Assunto:</span>
        <span className="min-w-0 flex-1 truncate text-left font-semibold">
          <SelectValue placeholder="Todos" />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos</SelectItem>
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
  );
}

/** Filtros ligados fora o assunto, que já aparece escrito no seletor. */
export function contarOutrosFiltros(v: ValoresFiltro): number {
  return contarFiltrosAtivos({ ...v, category: "" });
}

/**
 * LÓGICA DO LUCIANO: recolhido por padrão e com a contagem de filtros ativos no
 * botão. Seis controles sempre visíveis empurrariam a lista para baixo da dobra
 * no celular, e o problema real não é achar o filtro: é lembrar que ele está
 * ligado. A contagem no botão resolve isso mesmo com o painel fechado, que é
 * quando a pessoa se pergunta por que a lista está estranha.
 */
export function BotaoFiltros({
  aberto,
  aoAlternar,
  ativos,
}: {
  aberto: boolean;
  aoAlternar: () => void;
  ativos: number;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-expanded={aberto}
      aria-controls="painel-filtros"
      onClick={aoAlternar}
    >
      <Filter /> Mais filtros
      {ativos > 0 && (
        <span className="rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">
          {ativos}
        </span>
      )}
    </Button>
  );
}

export function PainelFiltros({
  valores,
  aoMudar,
  aoLimpar,
}: {
  valores: ValoresFiltro;
  aoMudar: (parcial: Partial<ValoresFiltro>) => void;
  aoLimpar: () => void;
}) {
  const ativos = contarOutrosFiltros(valores);

  return (
    <section
      id="painel-filtros"
      aria-label="Mais filtros"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
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

      <div className="flex items-end">
        {ativos > 0 ? (
          <Button type="button" variant="ghost" onClick={aoLimpar}>
            <X /> Limpar {ativos === 1 ? "o filtro" : `os ${ativos} filtros`}
          </Button>
        ) : (
          <p className="pb-3 text-sm text-muted-foreground">Nenhum filtro ligado além do assunto.</p>
        )}
      </div>
    </section>
  );
}
