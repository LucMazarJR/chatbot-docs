/**
 * As vozes naturais que a pessoa escolhe em Acessibilidade.
 *
 * Seis, e não as trinta do Gemini: numa lista longa, quem tem dificuldade não
 * chega ao fim, e várias vozes da lista são agitadas ou rápidas demais para
 * quem ouve com calma. A descrição é a que o Google dá a cada uma, traduzida.
 * Vale no navegador (a lista da tela) e no servidor (a conferência do nome).
 */
export const VOZES = [
  { nome: 'Sulafat', descricao: 'Calorosa' },
  { nome: 'Vindemiatrix', descricao: 'Suave' },
  { nome: 'Achernar', descricao: 'Macia' },
  { nome: 'Achird', descricao: 'Amigável' },
  { nome: 'Kore', descricao: 'Firme' },
  { nome: 'Charon', descricao: 'Informativa' },
] as const;

export type NomeDaVoz = (typeof VOZES)[number]['nome'];

export const VOZ_PADRAO: NomeDaVoz = 'Sulafat';

/** O nome, se for uma das vozes da lista; senão, a padrão. */
export function vozDaLista(nome: unknown): NomeDaVoz {
  return VOZES.find((voz) => voz.nome === nome)?.nome ?? VOZ_PADRAO;
}
