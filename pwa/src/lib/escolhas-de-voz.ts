import { escolhaDeVoz, VOZ_DO_CELULAR, type EscolhaDeVoz } from './vozes';

/**
 * As duas escolhas de voz, guardadas no aparelho.
 *
 * `entrada`: quem entende o que a pessoa fala. `ia` manda o áudio, como no
 * WhatsApp, e o Gemini transcreve; `celular` é o ditado do navegador, que
 * escreve no campo para conferir antes de enviar.
 * `voz`: quem fala as respostas, uma voz natural ou a do celular.
 *
 * Separadas para o grupo comparar cada parte da IA com a do aparelho, e decidir
 * se o custo de cada uma vale. Lógica pura, com a leitura injetada.
 */
export type Entrada = 'ia' | 'celular';

export const CHAVE_ENTRADA = 'pwa:voz-entrada';
export const CHAVE_VOZ = 'pwa:voz-natural';
/**
 * A chave de antes das duas escolhas: uma só, que ligava ou desligava as duas
 * partes juntas. Quem a desligou continua com as duas no celular.
 */
export const CHAVE_ANTIGA = 'pwa:voz-ia';

export function lerEscolhasDeVoz(ler: (chave: string) => string | null): { entrada: Entrada; voz: EscolhaDeVoz } {
  const desligouAntes = ler(CHAVE_ANTIGA) === 'desligada';
  const entrada = ler(CHAVE_ENTRADA);
  const voz = ler(CHAVE_VOZ);
  return {
    entrada: entrada === 'ia' || entrada === 'celular' ? entrada : desligouAntes ? 'celular' : 'ia',
    voz: voz ? escolhaDeVoz(voz) : desligouAntes ? VOZ_DO_CELULAR : escolhaDeVoz(null),
  };
}
