import type { SerieUbs } from "@/lib/ubs.functions";

/**
 * Os intervalos da série chegam do back como texto no fuso da equipe
 * ("2026-11-26" ou "2026-11-26T14"), e não como instante: assim o rótulo sai
 * certo sem conta de fuso no navegador, que pode estar em outro.
 */

/** Como o começo de um intervalo aparece no eixo: "14h", "26/11". */
export function rotuloDoIntervalo(intervalo: string, granularidade: SerieUbs["granularidade"]) {
  if (granularidade === "hora") return `${Number(intervalo.slice(11, 13))}h`;
  const [, mes, dia] = intervalo.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

/** O mesmo, por extenso, para a dica e a tabela: "Semana de 23/11", "26/11 às 14h". */
export function rotuloCompleto(intervalo: string, granularidade: SerieUbs["granularidade"]) {
  const [, mes, dia] = intervalo.slice(0, 10).split("-");
  if (granularidade === "hora") return `${dia}/${mes} às ${Number(intervalo.slice(11, 13))}h`;
  if (granularidade === "semana") return `Semana de ${dia}/${mes}`;
  return `${dia}/${mes}`;
}
