import { Injectable } from '@nestjs/common';

/**
 * Rede de segurança de formatação.
 *
 * O prompt do agente no n8n pedia HTML do Telegram (`<b>`, `<p>`,
 * `parse_mode=HTML`) enquanto a entrega sempre foi WhatsApp — resultado: as
 * tags chegavam literais para o cidadão. O prompt foi corrigido, mas um LLM
 * eventualmente desobedece; este serviço garante que nada disso vaze.
 *
 * A correção certa é o prompt. Isto é a segunda camada, não a primeira.
 */
@Injectable()
export class TextFormatterService {
  format(input: string): string {
    let text = input;

    text = convertHtmlToWhatsApp(text);
    text = convertMarkdownToWhatsApp(text);
    text = decodeHtmlEntities(text);
    text = normalizeWhitespace(text);

    return text.trim();
  }
}

/** WhatsApp não interpreta HTML: `<b>x</b>` vira `*x*`, o resto some. */
function convertHtmlToWhatsApp(text: string): string {
  return text
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<\s*(b|strong)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '*$2*')
    .replace(/<\s*(i|em)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '_$2_')
    .replace(/<\s*(s|del|strike)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '~$2~')
    .replace(/<\s*(code|pre)\s*>(.*?)<\s*\/\s*\1\s*>/gis, '```$2```')
    .replace(/<\s*a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>(.*?)<\s*\/\s*a\s*>/gis, '$2 ($1)')
    .replace(/<[^>]+>/g, '');
}

/**
 * Markdown → sintaxe do WhatsApp.
 *
 * A ordem importa: `**negrito**` precisa virar `*negrito*` antes de qualquer
 * tratamento de `*` solto, senão o resultado fica com asteriscos duplicados.
 */
function convertMarkdownToWhatsApp(text: string): string {
  return (
    text
      .replace(/\*\*\*(.+?)\*\*\*/gs, '*_$1_*')
      .replace(/\*\*(.+?)\*\*/gs, '*$1*')
      .replace(/__(.+?)__/gs, '_$1_')
      // Títulos não existem no WhatsApp; viram negrito.
      .replace(/^#{1,6}\s+(.*)$/gm, '*$1*')
      // Marcadores de lista com `*`/`-` viram `•`: `*` no início de linha é
      // interpretado como negrito pelo WhatsApp e desconfigura a mensagem.
      .replace(/^[ \t]*[*-][ \t]+/gm, '• ')
      .replace(/^[ \t]*>[ \t]?/gm, '')
  );
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => entities[match] ?? match);
}

/** No máximo uma linha em branco entre blocos, sem espaços no fim das linhas. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}
