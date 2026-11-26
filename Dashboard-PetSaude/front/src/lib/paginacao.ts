import { useEffect, useState } from "react";

/** O formato que as listas paginadas do back devolvem (comum/paginacao.ts). */
export type PaginaDe<T> = {
  itens: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
};

export const POR_PAGINA = 20;

/**
 * Aceita também a resposta do back antigo, sem paginação.
 *
 * Front (Vercel) e back (Render) publicam em tempos diferentes: por alguns
 * minutos o front novo pode falar com o back antigo, que devolve a lista
 * inteira (ou `{itens, total}` sem página). Sem isto, a tela quebraria até o
 * back terminar de subir.
 */
export function comoPagina<T>(
  resposta: PaginaDe<T> | T[] | { itens: T[]; total?: number },
): PaginaDe<T> {
  if (Array.isArray(resposta)) return paginaUnica(resposta, resposta.length);
  if ("totalPages" in resposta) return resposta;
  const itens = resposta.itens ?? [];
  return paginaUnica(itens, resposta.total ?? itens.length);
}

function paginaUnica<T>(itens: T[], total: number): PaginaDe<T> {
  return { itens, total, page: 1, limit: itens.length || POR_PAGINA, totalPages: 1 };
}

/**
 * Paginação de uma lista que já chegou inteira.
 *
 * Para as listas que o back devolve de uma vez (pessoas de um aviso, grafias,
 * perguntas do dia): o peso não está em trazer, está em desenhar centenas de
 * linhas de uma vez, e o celular sente. Se a lista encolher (alguém corrigiu
 * uma grafia, por exemplo) e a página atual deixar de existir, volta para a
 * última que existe, em vez de mostrar uma página vazia.
 */
export function usePaginaLocal<T>(lista: T[], porPagina = POR_PAGINA) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(lista.length / porPagina));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const atual = Math.min(page, totalPages);
  const inicio = (atual - 1) * porPagina;
  return {
    itens: lista.slice(inicio, inicio + porPagina),
    page: atual,
    totalPages,
    setPage,
    primeiro: lista.length ? inicio + 1 : 0,
    ultimo: Math.min(inicio + porPagina, lista.length),
    total: lista.length,
  };
}
