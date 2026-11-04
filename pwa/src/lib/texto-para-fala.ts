/**
 * O texto como deve ser falado.
 *
 * A resposta vem com a formatação do WhatsApp. Lidos em voz alta, os
 * asteriscos, sublinhados e marcadores viram "asterisco", e um link vira uma
 * sequência de letras. Os links saem com "(link)", para a pessoa saber que há
 * um endereço na tela.
 *
 * Fica fora de `leitura-em-voz.ts`, que só roda no navegador: a voz natural,
 * gerada no servidor, fala o mesmo texto limpo que a voz do aparelho.
 */
export function textoParaFala(texto: string): string {
  return texto
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_~]/g, '')
    .replace(/^[\s]*[•·\-]\s*/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/([.,!?:])\s*[.,]\s*/g, '$1 ')
    .trim();
}
