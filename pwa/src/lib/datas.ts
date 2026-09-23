/**
 * Data e hora, sempre no fuso de quem usa o chat.
 *
 * LÓGICA DO LUCIANO: o container e a Vercel rodam em UTC, e o celular de quem
 * usa está em Brasília. Sem fixar o fuso, a mesma data saía diferente no HTML
 * do servidor e na tela depois de hidratar: o React derrubava a hidratação da
 * página (erro #418) e, pior, a conversa das 21h aparecia como meia-noite do
 * dia seguinte.
 *
 * Fixar o fuso vale porque o projeto atende um município brasileiro. Se um dia
 * atender outro país, o lugar de resolver isso é aqui.
 */
const FUSO = 'America/Sao_Paulo';

const paraData = (valor: Date | string) => (valor instanceof Date ? valor : new Date(valor));

/** 16/09 */
export function diaEMes(valor: Date | string): string {
  return paraData(valor).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
}

/** 16/09/2026 */
export function dataCurta(valor: Date | string): string {
  return paraData(valor).toLocaleDateString('pt-BR', { timeZone: FUSO });
}

/** 21:32 */
export function hora(valor: Date | string): string {
  return paraData(valor).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

/** 16/09 às 21:32 */
export function dataEHora(valor: Date | string): string {
  return `${diaEMes(valor)} às ${hora(valor)}`;
}

/** terça-feira, 16 de setembro de 2026 */
export function dataPorExtenso(valor: Date | string): string {
  return paraData(valor).toLocaleDateString('pt-BR', {
    timeZone: FUSO,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
