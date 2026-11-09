/** Como o texto digitado chegou à unidade. */
export type ComoIdentificou = 'nome' | 'corrigida' | 'aproximada';

export type UnidadeParaBusca = {
    id: string;
    /** O nome normalizado. Ver chaveDeUbs. */
    chave: string;
    /** Grafias que alguém da equipe confirmou no painel, já normalizadas. */
    apelidos: string[];
};

export type UbsIdentificada = { id: string; como: ComoIdentificou };

/**
 * O que não distingue uma unidade de outra.
 *
 * "UBS do Aeroporto", "Posto Aeroporto" e "unidade de saúde aeroporto" são a
 * mesma unidade, e o que muda entre eles é só isto aqui.
 */
const PALAVRAS_IGNORADAS = new Set([
    'ubs', 'ubsf', 'esf', 'usf', 'psf', 'unidade', 'basica', 'saude', 'posto', 'centro',
    'estrategia', 'familia', 'bairro', 'jardim', 'jd', 'vila', 'vl', 'parque', 'pq',
    'franca', 'sp', 'de', 'do', 'da', 'dos', 'das', 'e',
]);

/**
 * "Aeroporto 3", "Aeroporto três" e "Aeroporto III" precisam dar no mesmo: sem
 * isto, "aeroporto 3" fica a dois passos tanto de "aeroporto" quanto de
 * "aeroporto iii", e nenhum dos dois ganha.
 */
const SINONIMOS: Record<string, string> = {
    '1': 'i', um: 'i',
    '2': 'ii', dois: 'ii',
    '3': 'iii', tres: 'iii',
    '4': 'iv', quatro: 'iv',
    sta: 'santa',
    sto: 'santo',
};

const NUMEROS = new Set(['i', 'ii', 'iii', 'iv']);

/** Minúsculo, sem acento nem pontuação, e só com as palavras que distinguem. */
export function chaveDeUbs(texto: string | null | undefined): string {
    return (texto ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter((palavra) => palavra && !PALAVRAS_IGNORADAS.has(palavra))
        .map((palavra) => SINONIMOS[palavra] ?? palavra)
        .join(' ');
}

/**
 * Por onde um texto é agrupado e corrigido na tela.
 *
 * Quem escreveu só "UBS" fica com a chave vazia, e agrupar pela chave juntaria
 * esses casos a outros textos que não têm nome nenhum.
 */
export function chaveDaGrafia(texto: string): string {
    return chaveDeUbs(texto) || texto.trim().toLowerCase();
}

/** Quantas trocas de letra (inserir, tirar, trocar, inverter vizinhas) separam dois textos. */
export function distancia(a: string, b: string): number {
    const linhas = a.length + 1;
    const colunas = b.length + 1;
    const d: number[][] = Array.from({ length: linhas }, (_, i) =>
        Array.from({ length: colunas }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i < linhas; i++) {
        for (let j = 1; j < colunas; j++) {
            const custo = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
}

/** Nome curto admite menos erro: em "Palma", duas trocas já viram outra palavra. */
function toleranciaPara(tamanho: number): number {
    if (tamanho < 5) return 0;
    return tamanho < 9 ? 1 : 2;
}

/**
 * Qual unidade o texto digitado quer dizer, ou null se não der para afirmar.
 *
 * LÓGICA DO LUCIANO: errar para o lado errado aqui fabrica número. Atribuir uma
 * conversa à "UBS Paulista" quando a pessoa queria a "Paulistano" é pior do que
 * mandar o texto para revisão, porque o erro não aparece em lugar nenhum. Por
 * isso, cada passo só decide quando existe UM vencedor. Empate volta null, e
 * alguém decide na tela: a resposta fica registrada como apelido e vale dali
 * em diante.
 *
 * Sem IA de propósito. A lista é pequena e fechada, comparar letras resolve, e
 * o texto foi escrito por um cidadão: não há por que mandá-lo para fora.
 */
export function identificarUbs(texto: string, unidades: UnidadeParaBusca[]): UbsIdentificada | null {
    const grafia = chaveDaGrafia(texto);

    const corrigida = unidades.find((u) => u.apelidos.includes(grafia));
    if (corrigida) return { id: corrigida.id, como: 'corrigida' };

    const chave = chaveDeUbs(texto);
    if (!chave) return null;

    const exata = unidades.find((u) => u.chave === chave);
    if (exata) return { id: exata.id, como: 'nome' };

    const unica = (candidatas: UnidadeParaBusca[]): UbsIdentificada | null =>
        candidatas.length === 1 ? { id: candidatas[0].id, como: 'aproximada' } : null;

    const palavras = chave.split(' ');

    // "aeroporto iii perto da escola": o nome inteiro está ali dentro. Vale o
    // nome mais longo, para "aeroporto iii" ganhar de "aeroporto". Sobrar um
    // número desqualifica: "aeroporto 2" é outra unidade, não a "aeroporto".
    const contidas = unidades.filter((u) => {
        const doNome = u.chave.split(' ');
        return (
            doNome.every((p) => palavras.includes(p)) &&
            !palavras.some((p) => NUMEROS.has(p) && !doNome.includes(p))
        );
    });
    if (contidas.length) {
        const maior = Math.max(...contidas.map((u) => u.chave.split(' ').length));
        const mais = unica(contidas.filter((u) => u.chave.split(' ').length === maior));
        if (mais) return mais;
    }

    // "terezinha" no lugar de "santa terezinha". Palavra curta não conta: "sao"
    // sozinho não aponta para unidade nenhuma.
    const relevantes = palavras.filter((p) => p.length >= 4);
    if (relevantes.length) {
        const parciais = unica(
            unidades.filter((u) => relevantes.every((p) => u.chave.split(' ').includes(p))),
        );
        if (parciais) return parciais;
    }

    let menor = Infinity;
    let melhores: UnidadeParaBusca[] = [];
    for (const unidade of unidades) {
        const d = distancia(chave, unidade.chave);
        if (d > toleranciaPara(unidade.chave.length)) continue;
        if (d < menor) {
            menor = d;
            melhores = [unidade];
        } else if (d === menor) {
            melhores.push(unidade);
        }
    }
    return unica(melhores);
}
