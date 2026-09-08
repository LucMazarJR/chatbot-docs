/**
 * Formatação de texto no padrão do WhatsApp.
 *
 * Duas camadas, e as duas importam para o protótipo ser fiel:
 *
 * 1. `normalizar` — porte das mesmas quatro funções de
 *    backend/src/outbound/text-formatter.service.ts. No canal real, toda
 *    resposta do agente passa por elas antes de chegar ao cidadão: é a rede de
 *    segurança para quando o LLM desobedece o prompt e devolve HTML ou
 *    Markdown. O PWA não passa pelo gateway, então sem este porte o protótipo
 *    mostraria `<b>` literal numa situação em que o WhatsApp mostraria negrito
 *    — e a validação estaria medindo um defeito que não existe em produção.
 *
 * 2. `renderizar` — converte a sintaxe do WhatsApp para HTML, que é o que o
 *    aplicativo real faz na tela do celular.
 *
 * Se o formatador do gateway mudar, este arquivo muda junto.
 */

// --- Camada 1: normalização (espelho do gateway) ---------------------------

/** WhatsApp não interpreta HTML: `<b>x</b>` vira `*x*`, o resto some. */
function htmlParaWhatsApp(texto: string): string {
  return texto
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<\s*(b|strong)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*')
    .replace(/<\s*(i|em)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '_$2_')
    .replace(/<\s*(s|del|strike)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '~$2~')
    .replace(/<\s*(code|pre)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '```$2```')
    .replace(/<\s*a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '');
}

/**
 * Markdown para a sintaxe do WhatsApp.
 *
 * A ordem importa: `**negrito**` precisa virar `*negrito*` antes de qualquer
 * tratamento de `*` solto, senão sobram asteriscos duplicados.
 */
function markdownParaWhatsApp(texto: string): string {
  return (
    texto
      .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '*_$1_*')
      .replace(/\*\*([\s\S]+?)\*\*/g, '*$1*')
      .replace(/__([\s\S]+?)__/g, '_$1_')
      // Títulos não existem no WhatsApp; viram negrito.
      .replace(/^#{1,6}\s+(.*)$/gm, '*$1*')
      // Marcadores com `*`/`-` viram `•`: `*` no início de linha é interpretado
      // como negrito pelo WhatsApp e desconfigura a mensagem.
      .replace(/^[ \t]*[*-][ \t]+/gm, '• ')
      .replace(/^[ \t]*>[ \t]?/gm, '')
  );
}

function decodificarEntidades(texto: string): string {
  const entidades: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return texto.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39);/g,
    (achado) => entidades[achado] ?? achado,
  );
}

/** No máximo uma linha em branco entre blocos, sem espaços no fim das linhas. */
function normalizarEspacos(texto: string): string {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function normalizar(entrada: string): string {
  let texto = String(entrada ?? '');
  texto = htmlParaWhatsApp(texto);
  texto = markdownParaWhatsApp(texto);
  texto = decodificarEntidades(texto);
  texto = normalizarEspacos(texto);
  return texto.trim();
}

// --- Camada 2: renderização para HTML --------------------------------------

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Marcador dos blocos de código enquanto as outras marcações são aplicadas.
 *
 * Fica em texto puro e improvável (`%%` duplo não aparece em FAQ de saúde nem
 * em resposta de modelo) em vez de um caractere de controle: um NUL no meio do
 * fonte faz ferramentas de linha de comando tratarem o arquivo como binário.
 */
const MARCADOR = (indice: number) => `%%BLOCO${indice}%%`;

/**
 * Converte o texto normalizado em HTML seguro.
 *
 * O escape vem SEMPRE primeiro: a partir daí, as únicas tags no resultado são
 * as que esta função introduz. Nenhuma resposta do modelo chega crua ao
 * `dangerouslySetInnerHTML` do balão.
 */
export function renderizar(entrada: string): string {
  const texto = normalizar(entrada);

  // Blocos monoespaçados saem de cena antes das demais marcações, senão um `*`
  // dentro de um bloco de código viraria negrito.
  const blocos: string[] = [];
  let html = escaparHtml(texto).replace(/```([\s\S]+?)```/g, (_todo, conteudo: string) => {
    blocos.push(conteudo);
    return MARCADOR(blocos.length - 1);
  });

  // As bordas (`(?<![\w*])` e `(?!\s)`) imitam o WhatsApp: o marcador só vale
  // colado ao texto. Sem isso, "3 * 4 = 12" viraria itálico até o fim da linha.
  html = html
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '<strong>$1</strong>')
    .replace(/(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, '<em>$1</em>')
    .replace(/(?<![\w~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\w~])/g, '<s>$1</s>');

  html = html.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  html = html.replace(
    /%%BLOCO(\d+)%%/g,
    (_todo, indice: string) => `<code>${blocos[Number(indice)]}</code>`,
  );

  return html.replace(/\n/g, '<br>');
}
