import { FaqPagination } from "@/components/faq-pagination";

/**
 * "Mostrando X a Y de Z" e os números das páginas, como no fim da lista de FAQs.
 *
 * Com uma página só, mostra apenas a contagem: os botões de página não teriam
 * para onde ir, e o total continua útil.
 */
export function RodapeDaPagina({
  pagina,
  porPagina,
  quantos,
  total,
  totalPaginas,
  aoMudar,
}: {
  pagina: number;
  porPagina: number;
  /** Quantos itens a página atual tem. */
  quantos: number;
  total: number;
  totalPaginas: number;
  aoMudar: (pagina: number) => void;
}) {
  if (total === 0) return null;
  const primeiro = (pagina - 1) * porPagina + 1;
  const ultimo = primeiro + quantos - 1;

  return (
    <div className="flex flex-col items-center gap-2 pt-2 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {totalPaginas > 1
          ? `Mostrando ${primeiro.toLocaleString("pt-BR")} a ${ultimo.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`
          : `${total.toLocaleString("pt-BR")} no total`}
      </p>
      <div>
        <FaqPagination page={pagina} totalPages={totalPaginas} onPageChange={aoMudar} />
      </div>
    </div>
  );
}
