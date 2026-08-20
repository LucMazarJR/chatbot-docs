import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Props = {
  page: number;
  totalPages: number;
  /** Recebe a página escolhida e navega. */
  onPageChange: (page: number) => void;
};

/**
 * Janela de páginas ao redor da atual, com reticências nas pontas.
 *
 * O componente do shadcn renderiza um <a> puro, sem `asChild`. Aqui o clique é
 * interceptado para navegar pelo roteador em vez de recarregar a página, mas o
 * href continua real — assim abrir em nova aba e copiar o link seguem
 * funcionando.
 */
export function FaqPagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const paginas = janelaDePaginas(page, totalPages);

  const irPara = (destino: number) => (evento: React.MouseEvent) => {
    evento.preventDefault();
    if (destino >= 1 && destino <= totalPages && destino !== page) {
      onPageChange(destino);
    }
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={`?page=${Math.max(1, page - 1)}`}
            onClick={irPara(page - 1)}
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {paginas.map((numero, indice) =>
          numero === null ? (
            <PaginationItem key={`reticencias-${indice}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={numero}>
              <PaginationLink
                href={`?page=${numero}`}
                isActive={numero === page}
                onClick={irPara(numero)}
              >
                {numero}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href={`?page=${Math.min(totalPages, page + 1)}`}
            onClick={irPara(page + 1)}
            aria-disabled={page === totalPages}
            className={page === totalPages ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/** Primeira, última e uma janela ao redor da atual. `null` vira reticências. */
function janelaDePaginas(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const paginas = new Set<number>([1, total, atual]);
  for (const delta of [-1, 1]) {
    const vizinha = atual + delta;
    if (vizinha > 1 && vizinha < total) paginas.add(vizinha);
  }

  const ordenadas = [...paginas].sort((a, b) => a - b);
  const resultado: (number | null)[] = [];

  ordenadas.forEach((numero, indice) => {
    if (indice > 0 && numero - ordenadas[indice - 1] > 1) resultado.push(null);
    resultado.push(numero);
  });

  return resultado;
}
