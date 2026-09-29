/**
 * A parte do relatório do dia que não fala com banco nem com modelo.
 *
 * LÓGICA DO LUCIANO: fica separada para ser testada sozinha. É aqui que moram as
 * regras que decidem se o relatório diz a verdade: qual resposta pertence a qual
 * pergunta, quais números saem do banco e o que fazer quando o modelo devolve
 * uma área que não existe ou esquece uma pergunta.
 */

/**
 * As áreas em que o relatório agrupa as perguntas.
 *
 * LÓGICA DO LUCIANO: lista fixa, e não as categorias das FAQs. A lista oficial de
 * categorias ainda está vazia, e o campo `category` das FAQs tem mais de 260
 * valores soltos ("_vacinacao", "Consultas" e "consultas" como coisas
 * diferentes). Agrupar por ele daria um gráfico de 40 barras de uma pergunta
 * cada. Quando a lista oficial existir, é ela que deve substituir esta.
 */
export const AREAS = [
    'Medicamentos e receitas',
    'Unidades, endereços e horários',
    'Consultas, especialistas e encaminhamento',
    'Exames',
    'Vacinação',
    'Saúde mental',
    'Saúde bucal',
    'Urgência e emergência',
    'Procedimentos de enfermagem',
    'Gestação e saúde da criança',
    'Documentos, cadastro e direitos',
    'Programas e serviços especiais',
    'Sintomas e orientação de saúde',
    'Outros',
] as const;

export type Area = (typeof AREAS)[number];

export const PUBLICOS = ['cidadao', 'profissional', 'fora_de_escopo'] as const;
export type Publico = (typeof PUBLICOS)[number];

/** O que o sistema registrou sobre a resposta. Vem do banco, nunca do modelo. */
export type Situacao = 'respondida' | 'sem_resposta' | 'falhou' | 'sem_retorno';

/**
 * Por que a pergunta terminou como terminou. Quem diz é o modelo, dentro do que
 * a situação permite: pergunta respondida não pode ter "falta conteúdo" como
 * causa, e falha técnica é decidida pelo código.
 */
export const CAUSAS = [
    'respondida',
    'respondida_revisar',
    'falta_conteudo',
    'busca_nao_trouxe',
    'sem_contexto',
    'fora_de_escopo',
    'falha_tecnica',
    'nao_classificada',
] as const;
export type Causa = (typeof CAUSAS)[number];

const CAUSAS_DE_RESPONDIDA: Causa[] = ['respondida', 'respondida_revisar'];
const CAUSAS_DE_SEM_RESPOSTA: Causa[] = [
    'falta_conteudo',
    'busca_nao_trouxe',
    'sem_contexto',
    'fora_de_escopo',
];

/** Quantas perguntas vão num prompt só. */
export const TAMANHO_DO_LOTE = 100;

/** O que se lê de `pwa_prototipo.mensagens`, só os campos que o relatório usa. */
export type MensagemLida = {
    _id: string;
    sessaoId: string;
    papel: 'user' | 'bot';
    texto: string;
    em: Date;
    correlationId?: string | null;
    tipo?: string | null;
    pendente?: boolean;
    semResposta?: boolean;
    erro?: boolean;
    feedback?: 'up' | 'down' | null;
    latenciaMs?: number | null;
    trechosDebug?: { score: number; usado?: boolean; question?: string | null; category?: string | null }[];
};

export type SessaoLida = {
    _id: string;
    nome: string;
    iniciadaEm: Date;
    consentimentoEm?: Date | null;
    avaliacao?: { estrelas: number | null; nps: number | null; comentario: string | null } | null;
};

/** Uma pergunta do cidadão com a resposta que ela recebeu. */
export type Troca = {
    perguntaId: string;
    respostaId: string | null;
    sessaoId: string;
    em: Date;
    pergunta: string;
    resposta: string;
    situacao: Situacao;
    feedback: 'up' | 'down' | null;
    latenciaMs: number | null;
    /** Os melhores trechos que a busca devolveu, na ordem dela. */
    trechos: { question: string | null; category: string | null; score: number; usado: boolean }[];
};

export type Classificacao = {
    area: Area;
    publico: Publico;
    causa: Causa;
    comentario: string;
};

export type Escopo = {
    tema: string;
    /** Índices (base 0) das trocas do relatório. */
    perguntas: number[];
    motivo: string;
    sugestao: string;
};

/**
 * O dia pedido, no fuso da equipe, como intervalo [início, fim).
 *
 * Recebe a função de início do dia para não depender de `comum/fuso` aqui:
 * quem chama passa a mesma que o resto do sistema usa.
 */
export function intervaloDoDia(
    data: string,
    inicioDoDia: (agora: Date) => Date,
): { inicio: Date; fim: Date } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        throw new Error(`Data inválida: ${data}. Use o formato AAAA-MM-DD.`);
    }
    // Meio-dia em UTC cai no mesmo dia do calendário em qualquer fuso do
    // Brasil. Partir da meia-noite UTC daria o dia anterior em Brasília.
    const meioDia = new Date(`${data}T12:00:00Z`);
    const inicio = inicioDoDia(meioDia);
    const seguinte = new Date(meioDia.getTime() + 24 * 60 * 60 * 1000);
    return { inicio, fim: inicioDoDia(seguinte) };
}

/**
 * Pareia cada pergunta de texto do dia com a resposta que ela recebeu.
 *
 * LÓGICA DO LUCIANO: o par é o `correlationId`, e não a ordem. A resposta nasce
 * no MESMO milissegundo da pergunta, e ordenar só por data já pôs a resposta
 * antes da pergunta na transcrição. Sem `correlationId` (mensagens antigas), a
 * resposta é a primeira do bot depois da pergunta, na mesma sessão.
 *
 * Tentativas de áudio e arquivo ficam de fora: não são pergunta, e a resposta a
 * elas é sempre a mesma recusa fixa.
 */
export function parearTrocas(mensagens: MensagemLida[], inicio: Date, fim: Date): Troca[] {
    const ordenadas = [...mensagens].sort(
        (a, b) =>
            a.em.getTime() - b.em.getTime() ||
            // No empate, a pergunta vem antes da resposta.
            (a.papel === b.papel ? 0 : a.papel === 'user' ? -1 : 1),
    );

    const porCorrelacao = new Map<string, MensagemLida>();
    for (const m of ordenadas) {
        if (m.papel === 'bot' && m.correlationId) porCorrelacao.set(m.correlationId, m);
    }

    const usadas = new Set<string>();
    const trocas: Troca[] = [];

    for (let i = 0; i < ordenadas.length; i++) {
        const pergunta = ordenadas[i];
        if (pergunta.papel !== 'user' || pergunta.tipo) continue;
        if (pergunta.em < inicio || pergunta.em >= fim) continue;

        let resposta = pergunta.correlationId ? porCorrelacao.get(pergunta.correlationId) : undefined;
        if (!resposta) {
            resposta = ordenadas
                .slice(i + 1)
                .find(
                    (m) =>
                        m.papel === 'bot' &&
                        m.sessaoId === pergunta.sessaoId &&
                        !usadas.has(m._id) &&
                        !m.correlationId,
                );
        }
        if (resposta) usadas.add(resposta._id);

        trocas.push({
            perguntaId: pergunta._id,
            respostaId: resposta?._id ?? null,
            sessaoId: pergunta.sessaoId,
            em: pergunta.em,
            pergunta: pergunta.texto,
            resposta: resposta?.texto ?? '',
            situacao: situacaoDa(resposta),
            feedback: resposta?.feedback ?? null,
            latenciaMs: typeof resposta?.latenciaMs === 'number' && resposta.latenciaMs > 0 ? resposta.latenciaMs : null,
            trechos: (resposta?.trechosDebug ?? []).slice(0, 3).map((t) => ({
                question: t.question ?? null,
                category: t.category ?? null,
                score: t.score,
                usado: Boolean(t.usado),
            })),
        });
    }

    return trocas;
}

function situacaoDa(resposta: MensagemLida | undefined): Situacao {
    if (!resposta || resposta.pendente) return 'sem_retorno';
    if (resposta.erro) return 'falhou';
    if (resposta.semResposta) return 'sem_resposta';
    return 'respondida';
}

export type Numeros = {
    conversas: number;
    perguntas: number;
    respondidas: number;
    semResposta: number;
    falhas: number;
    /** A resposta não voltou: ficou pendente ou não existe. */
    semRetorno: number;
    positivos: number;
    negativos: number;
    avaliacoes: number;
    notaMedia: number | null;
    npsMedio: number | null;
    /** O que as pessoas escreveram na avaliação, sem identificação. */
    comentarios: string[];
    latenciaMediana: number | null;
    latenciaP90: number | null;
    latenciaMaxima: number | null;
    respostasAcimaDe60s: number;
    /** Aceitaram os termos no dia e não fizeram pergunta nenhuma. */
    aceitaramSemPerguntar: number;
    tentativasDeAudioOuArquivo: number;
};

/**
 * Os números do relatório.
 *
 * LÓGICA DO LUCIANO: todos saem daqui, contados do banco. O modelo recebe as
 * perguntas para classificar e comentar, e nunca é a fonte de um número: um
 * total escrito por ele poderia sair plausível e errado, e ninguém conferiria.
 */
export function calcularNumeros(
    trocas: Troca[],
    sessoes: SessaoLida[],
    mensagens: MensagemLida[],
    inicio: Date,
    fim: Date,
): Numeros {
    const comPergunta = new Set(trocas.map((t) => t.sessaoId));
    const conversas = sessoes.filter((s) => comPergunta.has(s._id));
    const avaliadas = conversas.filter((s) => s.avaliacao);
    const estrelas = avaliadas
        .map((s) => s.avaliacao?.estrelas)
        .filter((v): v is number => typeof v === 'number');
    const nps = avaliadas
        .map((s) => s.avaliacao?.nps)
        .filter((v): v is number => typeof v === 'number');
    const tempos = trocas
        .map((t) => t.latenciaMs)
        .filter((v): v is number => typeof v === 'number')
        .sort((a, b) => a - b);

    const noDia = (quando: Date | null | undefined) =>
        Boolean(quando) && (quando as Date) >= inicio && (quando as Date) < fim;

    return {
        conversas: conversas.length,
        perguntas: trocas.length,
        respondidas: trocas.filter((t) => t.situacao === 'respondida').length,
        semResposta: trocas.filter((t) => t.situacao === 'sem_resposta').length,
        falhas: trocas.filter((t) => t.situacao === 'falhou').length,
        semRetorno: trocas.filter((t) => t.situacao === 'sem_retorno').length,
        positivos: trocas.filter((t) => t.feedback === 'up').length,
        negativos: trocas.filter((t) => t.feedback === 'down').length,
        avaliacoes: avaliadas.length,
        notaMedia: estrelas.length ? media(estrelas) : null,
        npsMedio: nps.length ? media(nps) : null,
        comentarios: avaliadas
            .map((s) => (s.avaliacao?.comentario ?? '').trim())
            .filter((c) => c.length > 0),
        latenciaMediana: percentil(tempos, 50),
        latenciaP90: percentil(tempos, 90),
        latenciaMaxima: tempos.length ? tempos[tempos.length - 1] : null,
        respostasAcimaDe60s: tempos.filter((t) => t >= 60_000).length,
        aceitaramSemPerguntar: sessoes.filter(
            (s) => noDia(s.consentimentoEm) && !comPergunta.has(s._id),
        ).length,
        tentativasDeAudioOuArquivo: mensagens.filter(
            (m) => m.papel === 'user' && m.tipo && noDia(m.em),
        ).length,
    };
}

function media(valores: number[]): number {
    return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Recebe a lista já ordenada. */
function percentil(ordenados: number[], p: number): number | null {
    if (!ordenados.length) return null;
    const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
    return ordenados[Math.max(0, indice)];
}

/**
 * Divide em lotes do mesmo tamanho, sem passar do máximo.
 *
 * 101 perguntas viram 51 + 50, e não 100 + 1: um lote de uma pergunta só não
 * dá ao modelo nada para comparar, e é comparando que ele acha os escopos.
 */
export function dividirEmLotes<T>(itens: T[], maximo = TAMANHO_DO_LOTE): T[][] {
    if (itens.length === 0) return [];
    const quantos = Math.ceil(itens.length / maximo);
    const tamanho = Math.ceil(itens.length / quantos);
    const lotes: T[][] = [];
    for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
    return lotes;
}

const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
    respondida: 'RESPONDIDA',
    sem_resposta: 'SEM RESPOSTA',
    falhou: 'FALHOU',
    sem_retorno: 'SEM RETORNO',
};

/** O prompt de um lote. As perguntas são numeradas de 1 dentro do lote. */
export function montarPrompt(lote: Troca[]): string {
    const blocos = lote.map((troca, i) => {
        const trechos = troca.trechos.length
            ? troca.trechos
                  .map(
                      (t) =>
                          `${t.score.toFixed(3)} ${limpar(t.question ?? '(sem pergunta)', 90)}` +
                          (t.category ? ` (${limpar(t.category, 40)})` : ''),
                  )
                  .join(' | ')
            : 'nenhuma';
        return [
            `${i + 1}. [${ROTULO_DA_SITUACAO[troca.situacao]}] "${limpar(troca.pergunta, 400)}"`,
            `   Resposta: "${limpar(troca.resposta, 240)}"`,
            `   FAQs próximas: ${trechos}`,
        ].join('\n');
    });

    return [
        'Você analisa o desempenho de um chatbot de saúde pública de um município brasileiro.',
        'O chatbot responde a partir de uma base de perguntas frequentes (FAQs). Abaixo estão',
        'as perguntas feitas num dia de teste. Cada uma traz a situação registrada pelo sistema,',
        'o começo da resposta e as FAQs mais próximas que a busca encontrou, com a proximidade',
        'de 0 a 1. Só entram na resposta as FAQs com proximidade a partir de 0.82.',
        '',
        'Para CADA pergunta, devolva:',
        `- area: exatamente uma destas: ${AREAS.map((a) => `"${a}"`).join(', ')}.`,
        '- publico: "cidadao" (dúvida de quem usa o SUS), "profissional" (dúvida de trabalho de',
        '  profissional de saúde: protocolo, conduta, quem atender primeiro) ou "fora_de_escopo"',
        '  (não é sobre saúde nem serviço de saúde, é teste ou saudação solta).',
        '- causa:',
        '  se a situação é RESPONDIDA: "respondida", ou "respondida_revisar" quando a resposta',
        '  parece não tratar do que foi perguntado ou usa FAQ de outro assunto.',
        '  se a situação é SEM RESPOSTA: "falta_conteudo" (nenhuma FAQ listada trata do assunto),',
        '  "busca_nao_trouxe" (a base parece ter o assunto, mas a busca não trouxe a FAQ certa:',
        '  trouxe FAQs parecidas demais, como a receita de cada remédio, ou a pergunta curta ou',
        '  com erro de grafia não chegou nela), "sem_contexto" (a pergunta depende da anterior,',
        '  como "e lá?" ou "mas precisa de encaminhamento?") ou "fora_de_escopo".',
        '  se a situação é FALHOU ou SEM RETORNO: "falha_tecnica".',
        '- comentario: uma frase curta, de até 160 caracteres, dizendo o que aconteceu e, se não',
        '  foi respondida, o que falta. Não escreva orientação de saúde.',
        '',
        'Depois, no geral:',
        '- escopos: até 6 temas que precisam de revisão na base, cada um com os números das',
        '  perguntas, o motivo e uma sugestão prática (por exemplo: "escrever uma FAQ geral sobre',
        '  renovação de receita vencida"). Priorize os temas com mais perguntas sem resposta.',
        '- resumo: de 3 a 5 frases para a equipe, em português simples, sem repetir números',
        '  (eles já aparecem no relatório), dizendo o que funcionou, o que falhou e o que fazer',
        '  primeiro.',
        '',
        'Responda só com JSON neste formato:',
        '{"perguntas":[{"n":1,"area":"Vacinação","publico":"cidadao","causa":"respondida",',
        '"comentario":"..."}],"escopos":[{"tema":"...","perguntas":[2,5],"motivo":"...",',
        '"sugestao":"..."}],"resumo":"..."}',
        '',
        'Toda pergunta aparece exatamente uma vez em "perguntas", com o mesmo número.',
        '',
        'Perguntas:',
        '',
        ...blocos,
    ].join('\n');
}

/**
 * O prompt que junta os lotes, quando o dia teve perguntas demais para um só.
 *
 * Recebe o que já foi contado e os escopos de cada lote: o modelo junta temas
 * repetidos e escreve um resumo só, sem reler as perguntas.
 */
export function montarPromptDeSintese(
    numeros: Numeros,
    porArea: ContagemPorArea[],
    escopos: Escopo[],
    trocas: Troca[],
): string {
    const areas = porArea
        .map((a) => `- ${a.area}: ${a.total} perguntas, ${a.semResposta} sem resposta`)
        .join('\n');
    const lista = escopos
        .map((e, i) => {
            const exemplos = e.perguntas
                .slice(0, 4)
                .map((indice) => `"${limpar(trocas[indice]?.pergunta ?? '', 120)}"`)
                .join('; ');
            return `${i + 1}. ${e.tema} (${e.perguntas.length} perguntas). Motivo: ${e.motivo}. Sugestão: ${e.sugestao}. Exemplos: ${exemplos}`;
        })
        .join('\n');

    return [
        'Você escreve o fechamento de um relatório diário de um chatbot de saúde pública.',
        `No dia houve ${numeros.perguntas} perguntas: ${numeros.respondidas} respondidas,`,
        `${numeros.semResposta} sem resposta e ${numeros.falhas + numeros.semRetorno} com falha.`,
        '',
        'Perguntas por área:',
        areas,
        '',
        'Temas para revisão, levantados em partes separadas do dia (podem se repetir):',
        lista,
        '',
        'Devolva:',
        '- escopos: até 6 temas, juntando os repetidos. Em "de", liste os números dos temas',
        '  de cima que foram juntados em cada um.',
        '- resumo: de 3 a 5 frases para a equipe, em português simples, sem repetir números,',
        '  dizendo o que funcionou, o que falhou e o que fazer primeiro.',
        '',
        'Responda só com JSON neste formato:',
        '{"escopos":[{"tema":"...","de":[1,3],"motivo":"...","sugestao":"..."}],"resumo":"..."}',
    ].join('\n');
}

function limpar(texto: string, maximo: number): string {
    return texto.replace(/\s+/g, ' ').replace(/"/g, "'").trim().slice(0, maximo);
}

/**
 * Lê a classificação que o modelo devolveu para um lote.
 *
 * Nunca lança: devolve uma classificação para CADA troca do lote, na ordem. O
 * que faltar ou vier fora da lista fica com um valor que diz isso ("Outros",
 * "nao_classificada"), em vez de derrubar o relatório inteiro por uma linha.
 *
 * A causa é conferida contra a situação que o banco registrou. O modelo pode
 * dizer "falta conteúdo" para uma pergunta respondida; o banco é que sabe se ela
 * foi respondida.
 */
export function sanearClassificacao(bruta: unknown, lote: Troca[]): Classificacao[] {
    const lista = Array.isArray((bruta as { perguntas?: unknown })?.perguntas)
        ? ((bruta as { perguntas: unknown[] }).perguntas as Record<string, unknown>[])
        : [];

    const porNumero = new Map<number, Record<string, unknown>>();
    for (const item of lista) {
        const n = Number(item?.n);
        if (Number.isInteger(n) && n >= 1 && n <= lote.length && !porNumero.has(n)) {
            porNumero.set(n, item);
        }
    }

    return lote.map((troca, i) => {
        const item = porNumero.get(i + 1) ?? {};
        const area = AREAS.includes(item.area as Area) ? (item.area as Area) : 'Outros';
        const publico = PUBLICOS.includes(item.publico as Publico)
            ? (item.publico as Publico)
            : 'cidadao';
        return {
            area,
            publico,
            causa: causaCoerente(troca.situacao, item.causa),
            comentario: typeof item.comentario === 'string' ? limpar(item.comentario, 200) : '',
        };
    });
}

function causaCoerente(situacao: Situacao, proposta: unknown): Causa {
    const causa = CAUSAS.includes(proposta as Causa) ? (proposta as Causa) : null;
    if (situacao === 'falhou' || situacao === 'sem_retorno') return 'falha_tecnica';
    if (situacao === 'respondida') {
        return causa && CAUSAS_DE_RESPONDIDA.includes(causa) ? causa : 'respondida';
    }
    return causa && CAUSAS_DE_SEM_RESPOSTA.includes(causa) ? causa : 'nao_classificada';
}

/**
 * Lê os escopos de um lote e traduz os números do lote para índices do dia.
 *
 * Tema sem nenhuma pergunta real é descartado: sem as perguntas de origem, a
 * sugestão não tem como ser conferida por quem vai escrever a FAQ.
 */
export function sanearEscopos(bruta: unknown, tamanhoDoLote: number, deslocamento: number): Escopo[] {
    const lista = Array.isArray((bruta as { escopos?: unknown })?.escopos)
        ? ((bruta as { escopos: unknown[] }).escopos as Record<string, unknown>[])
        : [];

    return lista
        .map((item) => ({
            tema: typeof item?.tema === 'string' ? limpar(item.tema, 120) : '',
            perguntas: [
                ...new Set(
                    (Array.isArray(item?.perguntas) ? item.perguntas : [])
                        .map(Number)
                        .filter((n) => Number.isInteger(n) && n >= 1 && n <= tamanhoDoLote)
                        .map((n) => n - 1 + deslocamento),
                ),
            ],
            motivo: typeof item?.motivo === 'string' ? limpar(item.motivo, 300) : '',
            sugestao: typeof item?.sugestao === 'string' ? limpar(item.sugestao, 300) : '',
        }))
        .filter((e) => e.tema && e.perguntas.length > 0)
        .slice(0, 6);
}

/** Junta os escopos de vários lotes conforme a síntese mandou. */
export function juntarEscopos(bruta: unknown, escoposDosLotes: Escopo[]): Escopo[] {
    const lista = Array.isArray((bruta as { escopos?: unknown })?.escopos)
        ? ((bruta as { escopos: unknown[] }).escopos as Record<string, unknown>[])
        : [];

    const juntados = lista
        .map((item) => {
            const de = (Array.isArray(item?.de) ? item.de : [])
                .map(Number)
                .filter((n) => Number.isInteger(n) && n >= 1 && n <= escoposDosLotes.length);
            return {
                tema: typeof item?.tema === 'string' ? limpar(item.tema, 120) : '',
                perguntas: [...new Set(de.flatMap((n) => escoposDosLotes[n - 1].perguntas))].sort(
                    (a, b) => a - b,
                ),
                motivo: typeof item?.motivo === 'string' ? limpar(item.motivo, 300) : '',
                sugestao: typeof item?.sugestao === 'string' ? limpar(item.sugestao, 300) : '',
            };
        })
        .filter((e) => e.tema && e.perguntas.length > 0)
        .slice(0, 6);

    // Síntese que não apontou para nada volta para os escopos de cada lote: é
    // melhor um tema repetido que um relatório sem nenhum tema.
    return juntados.length > 0 ? juntados : escoposDosLotes.slice(0, 6);
}

export function lerResumo(bruta: unknown): string {
    const resumo = (bruta as { resumo?: unknown })?.resumo;
    return typeof resumo === 'string' ? resumo.trim().slice(0, 1500) : '';
}

export type ContagemPorArea = {
    area: Area;
    total: number;
    respondidas: number;
    semResposta: number;
    falhas: number;
};

/** Quantas perguntas por área, a partir do rótulo que o modelo deu a cada uma. */
export function contarPorArea(trocas: Troca[], classificacoes: Classificacao[]): ContagemPorArea[] {
    const contagem = new Map<Area, ContagemPorArea>();
    trocas.forEach((troca, i) => {
        const area = classificacoes[i]?.area ?? 'Outros';
        const linha = contagem.get(area) ?? { area, total: 0, respondidas: 0, semResposta: 0, falhas: 0 };
        linha.total += 1;
        if (troca.situacao === 'respondida') linha.respondidas += 1;
        else if (troca.situacao === 'sem_resposta') linha.semResposta += 1;
        else linha.falhas += 1;
        contagem.set(area, linha);
    });
    return [...contagem.values()].sort(
        (a, b) => b.total - a.total || b.semResposta - a.semResposta || a.area.localeCompare(b.area, 'pt-BR'),
    );
}

/** Quantas perguntas por causa, para o relatório dizer onde está o problema. */
export function contarPorCausa(classificacoes: Classificacao[]): Partial<Record<Causa, number>> {
    const contagem: Partial<Record<Causa, number>> = {};
    for (const c of classificacoes) contagem[c.causa] = (contagem[c.causa] ?? 0) + 1;
    return contagem;
}

/**
 * O formato que se pede ao modelo, no dialeto da API do Gemini.
 *
 * Com o esquema declarado, a área sai de uma lista fechada e o número de cada
 * pergunta vem como inteiro. Sem ele, o JSON chega válido e com a área escrita
 * de outro jeito ("Vacinas"), que o saneamento jogaria em "Outros".
 */
export const ESQUEMA_DO_LOTE = {
    type: 'OBJECT',
    properties: {
        perguntas: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    n: { type: 'INTEGER' },
                    area: { type: 'STRING', enum: [...AREAS] },
                    publico: { type: 'STRING', enum: [...PUBLICOS] },
                    causa: { type: 'STRING', enum: CAUSAS.filter((c) => c !== 'nao_classificada') },
                    comentario: { type: 'STRING' },
                },
                required: ['n', 'area', 'publico', 'causa', 'comentario'],
            },
        },
        escopos: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    tema: { type: 'STRING' },
                    perguntas: { type: 'ARRAY', items: { type: 'INTEGER' } },
                    motivo: { type: 'STRING' },
                    sugestao: { type: 'STRING' },
                },
                required: ['tema', 'perguntas', 'motivo', 'sugestao'],
            },
        },
        resumo: { type: 'STRING' },
    },
    required: ['perguntas', 'escopos', 'resumo'],
};

export const ESQUEMA_DA_SINTESE = {
    type: 'OBJECT',
    properties: {
        escopos: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    tema: { type: 'STRING' },
                    de: { type: 'ARRAY', items: { type: 'INTEGER' } },
                    motivo: { type: 'STRING' },
                    sugestao: { type: 'STRING' },
                },
                required: ['tema', 'de', 'motivo', 'sugestao'],
            },
        },
        resumo: { type: 'STRING' },
    },
    required: ['escopos', 'resumo'],
};
