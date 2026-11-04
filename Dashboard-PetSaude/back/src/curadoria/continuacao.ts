/**
 * Se uma pergunta depende da conversa para ter assunto.
 *
 * LÓGICA DO LUCIANO: a curadoria passou a mandar ao modelo a pergunta anterior
 * da mesma conversa, para "como chego lá?" deixar de virar "Como chegar a uma
 * unidade de saúde?". Mandada para toda pergunta, ela atrapalhou: "quem pode
 * tomar a pneumo-20?" foi agrupada com a herpes-zóster da pergunta de antes.
 * Ela só vai quando a frase não se sustenta sozinha: começa emendando ("e
 * fralda geriátrica?", "mas precisa de encaminhamento?"), aponta para algo dito
 * antes ("como chego lá?", "eles abrem no fds?") ou é curta demais para ter
 * assunto ("tem telefone?", "já tenho encaminhamento").
 */
const EMENDAS = new Set(['e', 'mas', 'entao', 'tambem', 'ai']);
const APONTAM = new Set(['la', 'ali', 'isso', 'isto', 'esse', 'essa', 'esses', 'essas', 'ele', 'ela', 'eles', 'elas', 'dele', 'dela', 'nele', 'nela']);
const CURTA = 3;

export function precisaDaConversa(pergunta: string): boolean {
    const palavras = pergunta
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    if (palavras.length === 0) return false;
    if (EMENDAS.has(palavras[0])) return true;
    if (palavras.some((p) => APONTAM.has(p))) return true;
    return palavras.length <= CURTA;
}

/** Quantas perguntas anteriores vão junto: duas, para "como chego lá?" depois de "e lá?" ainda chegar ao assunto. */
export const PERGUNTAS_ANTERIORES = 2;

/** As perguntas anteriores numa linha, da mais antiga para a mais recente. */
export const juntarAnteriores = (textos: string[]): string => textos.join(' → ');

/** Uma pergunta a reescrever: a frase da pessoa e o que ela perguntou antes. */
export type Continuacao = { pergunta: string; anterior: string };

/**
 * O pedido que reescreve as continuações antes do agrupamento.
 *
 * LÓGICA DO LUCIANO: com a pergunta anterior escrita ao lado, o modelo que
 * agrupa dez perguntas de uma vez continuou sugerindo "Como chegar a uma
 * unidade de saúde?" para "como chego lá?" depois de "aeroporto". Agrupar e
 * entender a referência ao mesmo tempo é demais para um modelo pequeno. A
 * reescrita do staging, que só reescreve, resolve as continuações, e este
 * pedido faz a mesma coisa: uma chamada para todas as continuações da rodada.
 */
export function montarPromptDeEntendimento(itens: Continuacao[]): string {
    return [
        'Cada item abaixo e uma pergunta que um cidadao fez ao chatbot de saude publica de',
        'Franca (SP), com o que ele tinha perguntado antes na mesma conversa.',
        '',
        'Reescreva cada pergunta por inteiro, entendivel sem a conversa: resolva as',
        'referencias ("la", "e o jejum?", "tem telefone?", "mas precisa de encaminhamento?")',
        'com o assunto das perguntas anteriores. Se a pergunta ja tem assunto proprio ou',
        'muda de assunto, ignore as anteriores e devolva a pergunta como esta, so com a',
        'grafia corrigida: nao transforme um termo solto ("diretora nga", "grupo',
        'hiperdia") numa pergunta, adivinhando o que a pessoa queria saber. Mantenha as',
        'siglas como a pessoa escreveu (UBS, UPA, NGA, CAPS, SUS). Nao acrescente nada que',
        'a pessoa nao disse e nao responda a pergunta.',
        '',
        'Responda em JSON: {"perguntas":[{"item":1,"pergunta":"..."}]}',
        '',
        'Itens:',
        ...itens.map((item, i) => `${i + 1}. Antes: ${item.anterior}\n   Pergunta: "${item.pergunta}"`),
    ].join('\n');
}

/** A forma da resposta, para a API garantir o JSON que `lerEntendimento` espera. */
export const ESQUEMA_DO_ENTENDIMENTO = {
    type: 'OBJECT',
    properties: {
        perguntas: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: { item: { type: 'INTEGER' }, pergunta: { type: 'STRING' } },
                required: ['item', 'pergunta'],
            },
        },
    },
    required: ['perguntas'],
};

/**
 * As perguntas reescritas, na ordem dos itens. Item que faltou ou veio vazio
 * fica nulo: a lacuna segue com a pergunta anterior ao lado, como sem este
 * passo.
 */
export function lerEntendimento(resposta: unknown, quantos: number): (string | null)[] {
    const lista = (resposta as { perguntas?: { item?: unknown; pergunta?: unknown }[] } | null)?.perguntas;
    const resultado: (string | null)[] = Array.from({ length: quantos }, () => null);
    if (!Array.isArray(lista)) return resultado;
    for (const p of lista) {
        const indice = Number(p?.item) - 1;
        if (Number.isInteger(indice) && indice >= 0 && indice < quantos && typeof p.pergunta === 'string' && p.pergunta.trim()) {
            resultado[indice] = p.pergunta.trim().slice(0, 400);
        }
    }
    return resultado;
}
