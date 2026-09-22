import { createHash, randomBytes } from 'node:crypto';

import { normalizarEmail } from './email';
import type { PerfilGoogle } from './vinculo';

/**
 * Entrar com Google: authorization code com PKCE, escrito à mão.
 *
 * LÓGICA DO LUCIANO: sem NextAuth nem biblioteca de OAuth. O fluxo são dois
 * redirecionamentos e uma troca de código, e uma biblioteca traria junto um
 * modelo próprio de sessão e de usuário que brigaria com o que já existe em
 * `sessao.ts`. Aqui fica só o protocolo; as rotas usam estas funções.
 */

export const URL_DE_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
export const URL_DO_TOKEN = 'https://oauth2.googleapis.com/token';

/** Onde o Google devolve a pessoa. Precisa estar cadastrado na credencial. */
export const CAMINHO_DO_RETORNO = '/api/conta/google/retorno';

export const COOKIE_DO_FLUXO = 'pwa_google';

/** Tempo para a pessoa escolher a conta no Google e voltar. */
const DURACAO_DO_FLUXO_S = 10 * 60;

const aleatorio = () => randomBytes(32).toString('base64url');

/** O desafio S256 do PKCE (RFC 7636, seção 4.2). */
export function desafioPkce(verificador: string): string {
  return createHash('sha256').update(verificador).digest('base64url');
}

/**
 * O endereço público pelo qual a pessoa chegou.
 *
 * Não é o `PWA_PUBLIC_URL`: no Docker ele vale `http://pwa:8080`, o endereço
 * interno que o n8n usa para devolver respostas, e o Google mandaria a pessoa
 * para um lugar que o celular dela não alcança. Atrás do túnel e da Vercel, o
 * endereço de verdade vem nos cabeçalhos `x-forwarded-*`.
 */
export function origemPublica(requisicao: Request): string {
  const url = new URL(requisicao.url);
  const primeiro = (valor: string | null) => valor?.split(',')[0].trim() || null;
  const protocolo = primeiro(requisicao.headers.get('x-forwarded-proto')) ?? url.protocol.replace(':', '');
  const host = primeiro(requisicao.headers.get('x-forwarded-host')) ?? requisicao.headers.get('host') ?? url.host;
  return `${protocolo}://${host}`;
}

/** O que atravessa o redirecionamento, guardado num cookie de vida curta. */
export type EstadoDoFluxo = {
  state: string;
  verificador: string;
  nonce: string;
};

export function novoFluxo(): EstadoDoFluxo {
  return { state: aleatorio(), verificador: aleatorio(), nonce: aleatorio() };
}

export function urlDeAutorizacao(fluxo: EstadoDoFluxo, clientId: string, redirectUri: string): string {
  const parametros = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: fluxo.state,
    nonce: fluxo.nonce,
    code_challenge: desafioPkce(fluxo.verificador),
    code_challenge_method: 'S256',
    // Sem isto, quem tem mais de uma conta Google no aparelho entra direto na
    // última usada — num celular emprestado, a de outra pessoa.
    prompt: 'select_account',
  });
  return `${URL_DE_AUTORIZACAO}?${parametros}`;
}

/**
 * O cookie do fluxo.
 *
 * `SameSite=Lax` e não `Strict`: a volta do Google é uma navegação vinda de
 * outro site, e o `Strict` não mandaria o cookie justo nela. O `Path` restrito
 * faz o cookie só existir nas duas rotas do fluxo.
 */
export function cookieDoFluxo(fluxo: EstadoDoFluxo, https: boolean): string {
  const valor = Buffer.from(JSON.stringify(fluxo)).toString('base64url');
  const partes = [
    `${COOKIE_DO_FLUXO}=${valor}`,
    'Path=/api/conta/google',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${DURACAO_DO_FLUXO_S}`,
  ];
  if (https) partes.push('Secure');
  return partes.join('; ');
}

export function cookieQueEncerraOFluxo(https: boolean): string {
  const partes = [`${COOKIE_DO_FLUXO}=`, 'Path=/api/conta/google', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (https) partes.push('Secure');
  return partes.join('; ');
}

export function lerFluxo(cabecalhoCookie: string | null): EstadoDoFluxo | null {
  if (!cabecalhoCookie) return null;
  for (const par of cabecalhoCookie.split(';')) {
    const [nome, ...resto] = par.trim().split('=');
    if (nome !== COOKIE_DO_FLUXO) continue;
    try {
      const fluxo = JSON.parse(Buffer.from(resto.join('='), 'base64url').toString('utf8')) as EstadoDoFluxo;
      if (typeof fluxo.state === 'string' && typeof fluxo.verificador === 'string' && typeof fluxo.nonce === 'string') {
        return { state: fluxo.state, verificador: fluxo.verificador, nonce: fluxo.nonce };
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** A parte do meio de um JWT, sem conferir assinatura (ver `conferirIdToken`). */
export function lerCargaDoJwt(jwt: string): Record<string, unknown> | null {
  const partes = jwt.split('.');
  if (partes.length !== 3) return null;
  try {
    const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return carga && typeof carga === 'object' ? (carga as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const EMISSORES = ['https://accounts.google.com', 'accounts.google.com'];

/** Folga para relógios levemente fora de hora. */
const FOLGA_S = 5 * 60;

/**
 * Confere o `id_token` e extrai o perfil, ou diz o que está errado.
 *
 * Sem conferir a assinatura, de propósito: o token veio direto do endpoint de
 * token do Google, por TLS, em resposta a um código que só este servidor podia
 * trocar (client secret + PKCE). A especificação do OpenID Connect (Core 1.0,
 * seção 3.1.3.7) dispensa a validação da assinatura nesse caso, e aceita a
 * autenticação do servidor TLS no lugar. Emissor, audiência, validade e nonce
 * continuam obrigatórios: são eles que garantem que o token é para este app e
 * para esta tentativa.
 *
 * `email_verified` é exigido porque o vínculo com contas de senha confia nele:
 * sem essa prova, um Google com e-mail não verificado tomaria a conta de quem
 * usa aquele endereço.
 */
export function conferirIdToken(
  carga: Record<string, unknown> | null,
  esperado: { clientId: string; nonce: string; agora: Date },
): { ok: true; perfil: PerfilGoogle } | { ok: false; motivo: string } {
  if (!carga) return { ok: false, motivo: 'id_token ilegível' };
  if (!EMISSORES.includes(String(carga.iss))) return { ok: false, motivo: 'emissor inesperado' };

  const audiencias = Array.isArray(carga.aud) ? carga.aud : [carga.aud];
  if (!audiencias.includes(esperado.clientId)) return { ok: false, motivo: 'token de outro aplicativo' };

  const agoraS = Math.floor(esperado.agora.getTime() / 1000);
  if (typeof carga.exp !== 'number' || carga.exp + FOLGA_S < agoraS) return { ok: false, motivo: 'token vencido' };
  if (carga.nonce !== esperado.nonce) return { ok: false, motivo: 'nonce diferente' };

  if (typeof carga.sub !== 'string' || !carga.sub) return { ok: false, motivo: 'sem sub' };
  if (typeof carga.email !== 'string' || !carga.email) return { ok: false, motivo: 'sem e-mail' };
  if (carga.email_verified !== true && carga.email_verified !== 'true') {
    return { ok: false, motivo: 'e-mail não verificado no Google' };
  }

  const nome = typeof carga.given_name === 'string' ? carga.given_name : typeof carga.name === 'string' ? carga.name : null;

  return {
    ok: true,
    perfil: { sub: carga.sub, email: normalizarEmail(carga.email), nome: nome?.trim().slice(0, 60) || null },
  };
}
