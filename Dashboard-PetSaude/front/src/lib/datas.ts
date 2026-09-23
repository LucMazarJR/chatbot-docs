/**
 * Data e hora, sempre no fuso de Brasília.
 *
 * LÓGICA DO LUCIANO: o front é renderizado no servidor (UTC, na Vercel) e
 * depois no navegador (Brasília). Sem fixar o fuso, a mesma data saía
 * diferente nos dois lados: o React acusava erro de hidratação, e o registro
 * das 22h aparecia como sendo do dia seguinte. O projeto atende um município
 * brasileiro; se um dia atender outro fuso, o lugar de mudar é aqui.
 */
const FUSO = "America/Sao_Paulo";

const paraData = (valor: Date | string | number) =>
  valor instanceof Date ? valor : new Date(valor);

/** 16/09 */
export function diaEMes(valor: Date | string | number): string {
  return paraData(valor).toLocaleDateString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
  });
}

/** 16/09/2026 */
export function dataCurta(valor: Date | string | number): string {
  return paraData(valor).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

/** 21:32 */
export function hora(valor: Date | string | number): string {
  return paraData(valor).toLocaleTimeString("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 16/09, 21:32 */
export function diaEHora(valor: Date | string | number): string {
  return `${diaEMes(valor)}, ${hora(valor)}`;
}

/** 16/09/2026, 21:32 */
export function dataEHora(valor: Date | string | number): string {
  return `${dataCurta(valor)}, ${hora(valor)}`;
}

/** 16 de setembro de 2026 */
export function dataPorExtenso(valor: Date | string | number): string {
  return paraData(valor).toLocaleDateString("pt-BR", {
    timeZone: FUSO,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
