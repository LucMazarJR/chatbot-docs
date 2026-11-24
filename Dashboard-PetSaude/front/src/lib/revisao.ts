import { dataCurta, diaIso } from "./datas";

/**
 * Revisão por data das FAQs, do lado da tela.
 *
 * As contas são feitas sobre o dia de Brasília ("AAAA-MM-DD"), e não sobre o
 * instante: "vence em 3 dias" precisa mudar à meia-noite daqui, e não às 21h,
 * que é a meia-noite de Greenwich. A situação oficial (vencida, próxima) vem
 * calculada do back; aqui é só o texto.
 */

/** Atalhos do formulário: o que costuma durar um surto, uma campanha, um ano. */
export const PRAZOS = [
  { rotulo: "1 mês", dias: 30 },
  { rotulo: "3 meses", dias: 90 },
  { rotulo: "6 meses", dias: 180 },
  { rotulo: "1 ano", dias: 365 },
] as const;

/** Hoje em Brasília, no formato do campo de data. */
export function hoje(): string {
  return diaIso(new Date());
}

/** O dia `n` dias depois de `dia`, as duas pontas como "AAAA-MM-DD". */
export function somarDias(dia: string, n: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + n)).toISOString().slice(0, 10);
}

/** Quantos dias de `de` até `ate` (negativo se `ate` já passou). */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** "Venceu há 3 dias", "Vence hoje", "Vence em 12 dias", ou a data quando está longe. */
export function textoDaRevisao(revisarEm: string): string {
  const faltam = diasEntre(hoje(), diaIso(revisarEm));
  if (faltam < -1) return `Venceu há ${-faltam} dias`;
  if (faltam === -1) return "Venceu ontem";
  if (faltam === 0) return "Vence hoje";
  if (faltam === 1) return "Vence amanhã";
  if (faltam <= 60) return `Vence em ${faltam} dias`;
  return `Revisar em ${dataCurta(revisarEm)}`;
}

/** O padrão de Minha conta, em palavras: "3 meses", "45 dias". */
export function textoDoPrazo(dias: number): string {
  return PRAZOS.find((p) => p.dias === dias)?.rotulo ?? `${dias} dias`;
}
