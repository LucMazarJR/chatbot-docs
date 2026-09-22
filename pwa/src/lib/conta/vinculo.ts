import type { Usuario } from './tipos';

/** O que o Google garantiu sobre quem acabou de entrar, já conferido. */
export type PerfilGoogle = {
  sub: string;
  email: string;
  nome: string | null;
};

export type DecisaoDeVinculo =
  /** Conta já ligada a este Google. */
  | { acao: 'entrar'; usuario: Usuario }
  /**
   * Conta de senha com o mesmo e-mail: passa a aceitar o Google também.
   *
   * `revogarSenha` quando o e-mail dela nunca tinha sido provado — ver
   * `decidirVinculo`.
   */
  | { acao: 'vincular'; usuario: Usuario; revogarSenha: boolean }
  | { acao: 'criar' }
  /** O e-mail já pertence a uma conta ligada a OUTRO Google. */
  | { acao: 'conflito' };

/**
 * O que fazer com um login do Google.
 *
 * LÓGICA DO LUCIANO: a ordem das regras é a defesa.
 *
 * 1. Procura pelo `sub`, e não pelo e-mail: o `sub` é o id da pessoa no Google e
 *    nunca muda; o e-mail ela pode trocar lá.
 * 2. Achou pelo e-mail uma conta de senha: vincula. O Google acabou de provar que
 *    quem está aqui controla esse endereço.
 *
 *    Mas se a conta de senha nunca provou o e-mail, quem a criou pode não ser o
 *    dono dele: bastava digitar o endereço de outra pessoa no cadastro, que não
 *    manda e-mail de confirmação. Se o vínculo mantivesse a senha, esse alguém
 *    continuaria entrando pela senha na conta que o dono de verdade passou a usar
 *    pelo Google — lendo as conversas e os avisos de saúde dele. Por isso, nesse
 *    caso, a senha é apagada e as sessões abertas caem. Quem era o dono de fato
 *    não perde nada: continua entrando pelo Google.
 * 3. Não achou nenhuma: cria a conta. Entrar e criar são o mesmo toque — ninguém
 *    precisa saber de antemão se já tem conta aqui. O aceite dos termos vem da
 *    frase ao lado do botão, e fica gravado com a data na conta criada.
 */
export function decidirVinculo(
  porSub: Usuario | null,
  porEmail: Usuario | null,
  perfil: PerfilGoogle,
): DecisaoDeVinculo {
  if (porSub) return { acao: 'entrar', usuario: porSub };

  if (porEmail) {
    if (porEmail.googleSub && porEmail.googleSub !== perfil.sub) return { acao: 'conflito' };
    return { acao: 'vincular', usuario: porEmail, revogarSenha: !porEmail.emailVerificado };
  }

  return { acao: 'criar' };
}
