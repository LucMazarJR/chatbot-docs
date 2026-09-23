/**
 * Contas de pessoas no PWA.
 *
 * Moram em `pwa_prototipo`, junto das conversas, porque é o banco que o
 * dashboard já lê: a equipe precisa enxergar quem pode receber aviso sem abrir
 * uma segunda conexão.
 */

export type Usuario = {
  _id: string;
  /** Como a pessoa digitou, para mostrar de volta. */
  email: string;
  /** Minúsculo e sem espaço nas pontas. É por aqui que se procura e se vincula. */
  emailNormalizado: string;
  /**
   * Alguém provou que controla este e-mail.
   *
   * Só o login pelo Google prova isso, porque o projeto não envia e-mail. É o campo que decide o que acontece quando um login do Google
   * encontra uma conta de senha com o mesmo endereço (ver `vinculo.ts`).
   */
  emailVerificado: boolean;
  /** Nulo em conta criada só pelo Google. */
  senhaHash: string | null;
  /** O `sub` do Google: estável, ao contrário do e-mail, que a pessoa pode trocar lá. */
  googleSub: string | null;
  nome: string | null;
  /** Aceite dos termos no cadastro. Cobre as conversas feitas com a conta. */
  consentimentoEm: Date;
  criadoEm: Date;
};

export type SessaoDeConta = {
  /**
   * SHA-256 do token do cookie, e nunca o token.
   *
   * Quem ler este banco (um backup, um acesso indevido) não consegue entrar
   * na conta de ninguém com o que está aqui.
   */
  _id: string;
  usuarioId: string;
  criadaEm: Date;
  expiraEm: Date;
  userAgent: string;
};

/** O que sai para o navegador. Sem hash de senha, sem id do Google. */
export type ContaPublica = {
  id: string;
  email: string;
  nome: string | null;
  emailVerificado: boolean;
  temSenha: boolean;
  temGoogle: boolean;
  criadoEm: string;
};
