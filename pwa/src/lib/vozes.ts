/**
 * As vozes que a pessoa escolhe em Letra e voz.
 *
 * Seis naturais, e não as trinta do Gemini: numa lista longa, quem tem
 * dificuldade não chega ao fim, e várias vozes da lista são agitadas ou rápidas
 * demais para quem ouve com calma. A descrição é a que o Google dá a cada uma,
 * traduzida, e é ela que a tela mostra: o nome técnico ("Sulafat") não diz nada
 * a quem escolhe, e fica para o registro e para o painel da equipe.
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

/**
 * A voz do próprio celular: robótica, sem custo e sem limite.
 *
 * É escolha da pessoa, ao lado das naturais, para o grupo comparar as duas e
 * decidir se a natural vale o custo; e é a reserva quando a natural acaba.
 */
export const VOZ_DO_CELULAR = 'celular';

export type EscolhaDeVoz = NomeDaVoz | typeof VOZ_DO_CELULAR;

/** A frase das amostras em public/vozes, que a voz do celular também lê na amostra dela. */
export const FRASE_DA_AMOSTRA = 'Olá! Esta é a voz que vai ler as respostas para você.';

/** O nome, se for uma das vozes naturais; senão, a padrão. */
export function vozDaLista(nome: unknown): NomeDaVoz {
  return VOZES.find((voz) => voz.nome === nome)?.nome ?? VOZ_PADRAO;
}

/** Uma escolha válida: uma voz natural ou a do celular. */
export function escolhaDeVoz(nome: unknown): EscolhaDeVoz {
  return nome === VOZ_DO_CELULAR ? VOZ_DO_CELULAR : vozDaLista(nome);
}

/** Como a tela chama a voz. */
export function rotuloDaVoz(escolha: EscolhaDeVoz): string {
  return escolha === VOZ_DO_CELULAR ? 'Do celular' : (VOZES.find((voz) => voz.nome === escolha)?.descricao ?? escolha);
}
