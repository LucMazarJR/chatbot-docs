import { createHash, randomBytes } from 'node:crypto';

import { contasSessoes, usuarios } from '@/lib/db';
import type { ContaPublica, Usuario } from './tipos';

export const COOKIE_CONTA = 'pwa_conta';

const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Abre uma sessão e devolve o token que vai no cookie.
 *
 * O token existe em dois lugares: o cookie do aparelho e a memória desta
 * função. No banco fica só o hash dele.
 */
export async function abrirSessaoDeConta(usuarioId: string, requisicao: Request): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const agora = new Date();

  await (await contasSessoes()).insertOne({
    _id: hashDoToken(token),
    usuarioId,
    criadaEm: agora,
    expiraEm: new Date(agora.getTime() + DURACAO_MS),
    userAgent: (requisicao.headers.get('user-agent') ?? '').slice(0, 300),
  });

  return token;
}

/**
 * A requisição chegou por HTTPS?
 *
 * Atrás do cloudflared e da Vercel o Next recebe HTTP, e quem sabe a verdade é
 * o `x-forwarded-proto`.
 */
function viaHttps(requisicao: Request): boolean {
  const encaminhado = requisicao.headers.get('x-forwarded-proto');
  if (encaminhado) return encaminhado.split(',')[0].trim() === 'https';
  return new URL(requisicao.url).protocol === 'https:';
}

/**
 * O cookie da conta.
 *
 * LÓGICA DO LUCIANO: `Secure` só quando a requisição veio por HTTPS, e não
 * sempre. Com `Secure` fixo, o navegador descarta o cookie recebido por HTTP, e
 * o teste presencial pelo IP da rede local (`http://192.168…:8080`) passaria a
 * aceitar a senha e esquecer o login na tela seguinte, sem erro nenhum. Push
 * não funciona por HTTP de qualquer jeito; o login, sim.
 *
 * `SameSite=Lax` é a proteção contra outro site disparar ações em nome de quem
 * está logado: o cookie não acompanha POST nem DELETE vindos de fora.
 */
export function cookieDeSessao(token: string, requisicao: Request): string {
  const partes = [
    `${COOKIE_CONTA}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DURACAO_MS / 1000)}`,
  ];
  if (viaHttps(requisicao)) partes.push('Secure');
  return partes.join('; ');
}

export function cookieQueEncerra(requisicao: Request): string {
  const partes = [`${COOKIE_CONTA}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (viaHttps(requisicao)) partes.push('Secure');
  return partes.join('; ');
}

export function tokenDoCookie(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  for (const par of cabecalho.split(';')) {
    const [nome, ...valor] = par.trim().split('=');
    if (nome === COOKIE_CONTA) return valor.join('=') || null;
  }
  return null;
}

/**
 * A conta dona do token, ou nulo.
 *
 * O `expiraEm` é conferido aqui além do TTL do banco: o Mongo só varre os
 * vencidos a cada minuto, e uma sessão expirada não pode valer nem nesse
 * intervalo.
 */
export async function contaPeloToken(token: string | null): Promise<Usuario | null> {
  if (!token) return null;

  const sessao = await (await contasSessoes()).findOne({
    _id: hashDoToken(token),
    expiraEm: { $gt: new Date() },
  });
  if (!sessao) return null;

  return (await usuarios()).findOne({ _id: sessao.usuarioId });
}

export function contaDaRequisicao(requisicao: Request): Promise<Usuario | null> {
  return contaPeloToken(tokenDoCookie(requisicao.headers.get('cookie')));
}

export async function encerrarSessaoDeConta(token: string | null): Promise<void> {
  if (!token) return;
  await (await contasSessoes()).deleteOne({ _id: hashDoToken(token) });
}

/** Derruba o acesso da conta em todos os aparelhos. */
export async function encerrarTodasAsSessoes(usuarioId: string): Promise<void> {
  await (await contasSessoes()).deleteMany({ usuarioId });
}

/**
 * A requisição veio de uma página deste site?
 *
 * Defesa em profundidade sobre o `SameSite=Lax`: navegadores antigos não o
 * respeitam, e uma rota que apaga conta não deve depender de uma única camada.
 * Sem cabeçalho `Origin` passa: é o caso do curl de diagnóstico, que não carrega
 * cookie de ninguém.
 */
export function origemConfiavel(requisicao: Request): boolean {
  const origem = requisicao.headers.get('origin');
  if (!origem) return true;

  const host = requisicao.headers.get('x-forwarded-host') ?? requisicao.headers.get('host');
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

export function contaPublica(usuario: Usuario): ContaPublica {
  return {
    id: usuario._id,
    email: usuario.email,
    nome: usuario.nome,
    emailVerificado: usuario.emailVerificado,
    temSenha: Boolean(usuario.senhaHash),
    temGoogle: Boolean(usuario.googleSub),
    criadoEm: usuario.criadoEm.toISOString(),
  };
}
