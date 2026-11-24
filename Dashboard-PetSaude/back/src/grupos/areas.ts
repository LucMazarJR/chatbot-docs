/**
 * As áreas do painel que um grupo libera, uma para cada item do menu.
 *
 * Espelhada em `front/src/lib/permissoes.ts`: mudar uma lista exige mudar a
 * outra na mesma alteração. O back é quem barra de verdade; o front só esconde
 * o que a pessoa não pode abrir.
 */

export type Nivel = 'ver' | 'editar';

export const AREAS = [
    'faqs',
    'revisoes',
    'categorias',
    'importar',
    'conversas',
    'unidades',
    'curadoria',
    'relatorios',
    'avisos',
    'usuarios',
    'historico',
    'configuracoes',
] as const;

export type Area = (typeof AREAS)[number];

/** Ausente = sem acesso. */
export type Permissoes = Partial<Record<Area, Nivel>>;

/**
 * Os níveis que fazem sentido em cada área. Importar não tem "ver" porque a
 * tela só serve para gravar, e o Histórico não tem "editar" porque ninguém
 * edita o registro do que aconteceu.
 */
export const NIVEIS_DA_AREA: Record<Area, readonly Nivel[]> = {
    faqs: ['ver', 'editar'],
    // Aqui o nível é o alcance, e não ler ou gravar: "ver" é revisar as FAQs que
    // a própria pessoa criou, e "editar" é revisar as de todo mundo. Nos dois,
    // quem revisa pode mudar o texto das FAQs que têm data de revisão.
    revisoes: ['ver', 'editar'],
    categorias: ['ver', 'editar'],
    importar: ['editar'],
    conversas: ['ver', 'editar'],
    unidades: ['ver', 'editar'],
    curadoria: ['ver', 'editar'],
    relatorios: ['ver', 'editar'],
    avisos: ['ver', 'editar'],
    usuarios: ['ver', 'editar'],
    historico: ['ver'],
    configuracoes: ['ver', 'editar'],
};

const PESO: Record<Nivel | 'nada', number> = { nada: 0, ver: 1, editar: 2 };

function peso(nivel: Nivel | undefined): number {
    return PESO[nivel ?? 'nada'];
}

/** "Editar" inclui "ver": quem pode gravar numa tela também pode abri-la. */
export function permite(permissoes: Permissoes, area: Area, nivel: Nivel): boolean {
    return peso(permissoes[area]) >= PESO[nivel];
}

/** Todas as áreas no nível mais alto que cada uma aceita. */
export function permissoesTotais(): Permissoes {
    return Object.fromEntries(
        AREAS.map((area) => {
            const niveis = NIVEIS_DA_AREA[area];
            return [area, niveis[niveis.length - 1]];
        }),
    ) as Permissoes;
}

/**
 * Confere e limpa as permissões que chegam do formulário de grupo.
 *
 * Toda pessoa vê as FAQs, seja qual for o grupo: é a tela inicial do painel, e
 * um grupo sem ela deixaria a pessoa entrar numa página que recusa a abrir. O
 * conteúdo também é o que o chatbot já responde a qualquer cidadão.
 */
export function normalizarPermissoes(
    entrada: unknown,
): { permissoes: Permissoes; erros: string[] } {
    const erros: string[] = [];
    const permissoes: Permissoes = {};

    if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
        return { permissoes: { faqs: 'ver' }, erros: ['As permissões precisam vir área por área.'] };
    }

    for (const [chave, valor] of Object.entries(entrada)) {
        if (!(AREAS as readonly string[]).includes(chave)) {
            erros.push(`Área desconhecida: ${chave}.`);
            continue;
        }
        const area = chave as Area;
        // "nada" e ausência são a mesma coisa: sem acesso.
        if (valor === null || valor === undefined || valor === 'nada') continue;
        if (!NIVEIS_DA_AREA[area].includes(valor as Nivel)) {
            erros.push(`Nível "${String(valor)}" não existe para ${area}.`);
            continue;
        }
        permissoes[area] = valor as Nivel;
    }

    if (!permissoes.faqs) permissoes.faqs = 'ver';

    return { permissoes, erros };
}

/**
 * True quando `pedido` não passa de `teto` em nenhuma área.
 *
 * É a trava contra alguém se promover: quem cuida das contas sem ser master só
 * põe pessoas em grupos que cabem no próprio acesso dele.
 */
export function cabeEm(pedido: Permissoes, teto: Permissoes): boolean {
    return AREAS.every((area) => peso(pedido[area]) <= peso(teto[area]));
}

/**
 * O papel antigo (admin, editor, leitor), deduzido das permissões.
 *
 * Existe para o front publicado antes dos grupos, que lê `role` para montar o
 * menu: o back sobe primeiro, e nos minutos até o front novo chegar o menu
 * antigo continua coerente. Pode sair quando nenhuma versão do front ler `role`.
 */
export function papelLegado(master: boolean, permissoes: Permissoes): 'admin' | 'editor' | 'leitor' {
    if (master || permite(permissoes, 'usuarios', 'editar')) return 'admin';
    if (permite(permissoes, 'faqs', 'editar')) return 'editor';
    return 'leitor';
}
