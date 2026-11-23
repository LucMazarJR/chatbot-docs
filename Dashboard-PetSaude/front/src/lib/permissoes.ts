/**
 * As áreas que um grupo libera, uma por item do menu.
 *
 * Espelha `back/src/grupos/areas.ts`: mudar uma lista exige mudar a outra na
 * mesma alteração. Aqui é conveniência (esconder o que a pessoa não pode
 * abrir); quem barra de verdade é o `@Permite` do backend.
 */

export type Nivel = "ver" | "editar";

export const AREAS = [
  "faqs",
  "categorias",
  "importar",
  "conversas",
  "unidades",
  "curadoria",
  "relatorios",
  "avisos",
  "usuarios",
  "historico",
  "configuracoes",
] as const;

export type Area = (typeof AREAS)[number];

/** Ausente = sem acesso. */
export type Permissoes = Partial<Record<Area, Nivel>>;

type InfoArea = {
  /** O que cada nível faz, em frase curta, para quem monta o grupo. */
  niveis: Partial<Record<Nivel, string>>;
  /** Mostra o que cidadãos escreveram no chat: dar acesso é decisão de privacidade. */
  dadoDeCidadao?: boolean;
};

/**
 * Importar não tem "ver" porque a tela só serve para gravar, e o Histórico não
 * tem "editar" porque ninguém edita o registro do que aconteceu.
 */
export const INFO_AREA: Record<Area, InfoArea> = {
  faqs: {
    niveis: { ver: "Lê as perguntas e respostas", editar: "Cria, edita, exclui e testa a busca" },
  },
  categorias: {
    niveis: { ver: "Vê a lista de assuntos", editar: "Cria, renomeia e junta assuntos" },
  },
  importar: {
    niveis: { editar: "Sobe planilha ou documento com FAQs" },
  },
  conversas: {
    niveis: { ver: "Lê e baixa uma conversa por vez", editar: "Também apaga e exporta todas" },
    dadoDeCidadao: true,
  },
  unidades: {
    niveis: { ver: "Vê de onde vêm as conversas", editar: "Corrige grafias e muda a lista" },
    dadoDeCidadao: true,
  },
  curadoria: {
    niveis: { ver: "Vê as perguntas e as sugestões", editar: "Analisa, aprova e descarta" },
    dadoDeCidadao: true,
  },
  relatorios: {
    niveis: { ver: "Lê os relatórios prontos", editar: "Também gera relatório novo" },
    dadoDeCidadao: true,
  },
  avisos: {
    niveis: { ver: "Vê os avisos e quem recebeu", editar: "Agenda e cancela avisos" },
    dadoDeCidadao: true,
  },
  usuarios: {
    niveis: { ver: "Vê as contas e os grupos", editar: "Cria contas, muda grupo e senha" },
  },
  historico: {
    niveis: { ver: "Lê quem mudou o quê" },
  },
  configuracoes: {
    niveis: { ver: "Vê o script e a saúde da base", editar: "Troca o script e gera vetores" },
  },
};

const PESO: Record<Nivel | "nada", number> = { nada: 0, ver: 1, editar: 2 };

/** Quem tem acesso a quê. `null` enquanto a sessão não chegou. */
export type ComAcesso = { master: boolean; permissoes: Permissoes } | null | undefined;

/** "Editar" inclui "ver", e o master pode tudo. */
export function pode(usuario: ComAcesso, area: Area, nivel: Nivel = "ver"): boolean {
  if (!usuario) return false;
  if (usuario.master) return true;
  return PESO[usuario.permissoes[area] ?? "nada"] >= PESO[nivel];
}

/** Mesma regra do back (`cabeEm`): o grupo não passa do acesso de quem atribui. */
export function cabeEm(pedido: Permissoes, teto: Permissoes): boolean {
  return AREAS.every((area) => PESO[pedido[area] ?? "nada"] <= PESO[teto[area] ?? "nada"]);
}
