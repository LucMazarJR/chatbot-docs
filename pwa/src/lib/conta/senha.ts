import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const SENHA_MIN = 8;

/**
 * Teto de tamanho, e não enfeite: o scrypt trabalha sobre a senha inteira, e
 * aceitar um megabyte de "senha" num formulário público é oferecer um jeito
 * barato de ocupar a CPU do servidor.
 */
export const SENHA_MAX = 200;

/**
 * Parâmetros do scrypt.
 *
 * LÓGICA DO LUCIANO: scrypt nativo do Node, e não bcrypt ou argon2. Os dois
 * dependem de binário compilado, e a imagem é `node:24-alpine`: é o tipo de
 * dependência que passa no computador de quem escreveu e quebra no build do
 * container, ou na Vercel, sem mensagem clara.
 *
 * N = 2^15 custa ~32 MB e algumas dezenas de milissegundos por verificação:
 * imperceptível para quem entra, caro para quem tenta milhões de senhas numa
 * base vazada. Os parâmetros vão gravados junto do hash, então dá para
 * aumentá-los no futuro sem invalidar as senhas que já existem.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const TAMANHO_CHAVE = 64;
const MEMORIA_MAXIMA = 64 * 1024 * 1024;

function derivar(senha: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    // NFKC: a mesma senha digitada em teclados diferentes pode chegar com
    // acentos compostos de jeitos diferentes, e viraria outra senha.
    scrypt(
      senha.normalize('NFKC'),
      salt,
      TAMANHO_CHAVE,
      { N: n, r, p, maxmem: MEMORIA_MAXIMA },
      (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)),
    );
  });
}

/** `scrypt$N$r$p$salt$hash`, com salt e hash em base64url. */
export async function gerarHashDeSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivar(senha, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/**
 * Um hash válido de uma senha que ninguém sabe.
 *
 * Usado quando o e-mail não existe: sem ele, "e-mail inexistente" responderia
 * na hora e "senha errada" levaria o tempo do scrypt, e cronometrar o login
 * diria a qualquer um quais e-mails têm conta: num assistente de saúde, isso
 * já é informação sobre a pessoa.
 */
let hashFalso: Promise<string> | null = null;

export async function conferirSenha(senha: string, guardado: string | null): Promise<boolean> {
  hashFalso ??= gerarHashDeSenha(randomBytes(32).toString('base64url'));
  const alvo = guardado ?? (await hashFalso);

  const partes = alvo.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, n, r, p, salt, hash] = partes;
  const nNumero = Number(n);
  // Parâmetros absurdos só chegariam aqui por um documento adulterado no
  // banco; recusar é melhor que alocar o que eles pedirem.
  if (!Number.isInteger(nNumero) || nNumero < 2 ** 10 || nNumero > 2 ** 17) return false;

  const esperado = Buffer.from(hash, 'base64url');
  const obtido = await derivar(senha, Buffer.from(salt, 'base64url'), nNumero, Number(r), Number(p));

  const confere = esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
  return guardado !== null && confere;
}
