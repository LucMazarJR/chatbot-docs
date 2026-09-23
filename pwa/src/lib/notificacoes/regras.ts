import type { ResultadoEntrega } from './tipos';

/**
 * As decisões do despachante, separadas do envio para poderem ser testadas sem
 * rede e sem banco.
 */

export const TENTATIVAS_MAXIMAS = 5;

/** Quanto tempo uma rodada segura um aviso antes de outra poder pegá-lo. */
export const TRAVA_MS = 2 * 60 * 1000;

/**
 * Enviar ou descartar.
 *
 * LÓGICA DO LUCIANO: aviso vencido não sai. O despachante roda no PC que
 * hospeda o Docker; se ele ficou desligado a noite toda, "seu exame é daqui a 2
 * horas" chegaria 10 horas depois do exame: pior do que não chegar, porque a
 * pessoa pode acreditar nele.
 */
export function decidir(validaAte: Date, agora: Date): 'enviar' | 'expirar' {
  return validaAte.getTime() <= agora.getTime() ? 'expirar' : 'enviar';
}

/**
 * O que um código de resposta do serviço de push quer dizer.
 *
 * - 404/410: o aparelho desinstalou, limpou os dados ou revogou a permissão. A
 *   inscrição morreu e não volta: insistir só gera erro para sempre.
 * - 401/403: a inscrição foi feita com outras chaves VAPID. Também não volta.
 * - 429 e 5xx: o serviço está sobrecarregado ou fora; tentar mais tarde.
 * - `null`: nem chegou a responder (rede, DNS). Tentar mais tarde.
 * - o resto (400, 413…): o pedido em si está errado; repetir daria o mesmo erro.
 */
export function classificarResposta(codigo: number | null): ResultadoEntrega {
  if (codigo === null) return 'tentar-de-novo';
  if (codigo >= 200 && codigo < 300) return 'enviada';
  if ([404, 410, 401, 403].includes(codigo)) return 'inscricao-morta';
  if (codigo === 429 || codigo >= 500) return 'tentar-de-novo';
  return 'falhou';
}

/**
 * Espera antes da próxima tentativa: 1, 5, 15 e 60 minutos.
 *
 * Crescente para não martelar um serviço que já disse estar sobrecarregado, e
 * curto no começo porque a maioria das falhas é uma oscilação de segundos.
 */
export function esperaAntesDaTentativa(tentativasJaFeitas: number): number {
  const minutos = [1, 5, 15, 60];
  return minutos[Math.min(Math.max(tentativasJaFeitas - 1, 0), minutos.length - 1)] * 60 * 1000;
}

/**
 * Por quanto tempo o serviço de push deve guardar o aviso se o aparelho estiver
 * desligado.
 *
 * Até `validaAte`, e não mais: é a mesma regra do descarte, aplicada do lado do
 * Google e da Apple. Entre 1 minuto e 4 semanas, o intervalo que eles aceitam.
 */
export function ttlEmSegundos(validaAte: Date, agora: Date): number {
  const segundos = Math.floor((validaAte.getTime() - agora.getTime()) / 1000);
  return Math.min(Math.max(segundos, 60), 28 * 24 * 60 * 60);
}
