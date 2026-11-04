import { cn } from "@/lib/utils";

/**
 * Escolha de uma opção entre poucas, lado a lado (período, situação).
 *
 * Substitui as fileiras de pílulas: nelas a opção marcada era só uma pílula
 * preenchida entre outras, e com três grupos seguidos não dava para ver de
 * relance o que estava valendo. O trilho cinza com a opção em relevo deixa a
 * escolha de cada grupo evidente.
 */
export function Segmentos<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  className,
}: {
  /** Nome do grupo para o leitor de tela. */
  rotulo: string;
  opcoes: { valor: T; rotulo: string; titulo?: string }[];
  valor: T;
  aoMudar: (valor: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn(
        "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px]",
        className,
      )}
    >
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === valor;
        return (
          <button
            key={opcao.valor}
            type="button"
            title={opcao.titulo}
            aria-pressed={ativo}
            onClick={() => aoMudar(opcao.valor)}
            className={cn(
              "min-h-10 shrink-0 whitespace-nowrap rounded-md px-3.5 text-[15px] font-semibold transition-colors",
              ativo
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
