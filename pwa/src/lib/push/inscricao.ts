import { createHash } from 'node:crypto';

export function idDaInscricao(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export type InscricaoRecebida = {
  endpoint: string;
  chaves: { p256dh: string; auth: string };
};

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Confere o que o navegador mandou de `PushSubscription.toJSON()`.
 *
 * Endpoint só por HTTPS: é para lá que o despachante vai fazer requisições em
 * nome do servidor, e aceitar qualquer URL transformaria a inscrição num jeito
 * de fazer o servidor chamar endereços internos da rede.
 *
 * As chaves têm tamanho conhecido: p256dh é um ponto da curva P-256 (65 bytes)
 * e auth são 16 bytes. O teto é folgado, mas existe.
 */
export function validarInscricao(corpo: unknown): InscricaoRecebida | null {
  const dados = corpo as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof dados?.endpoint === 'string' ? dados.endpoint : '';
  const p256dh = typeof dados?.keys?.p256dh === 'string' ? dados.keys.p256dh : '';
  const auth = typeof dados?.keys?.auth === 'string' ? dados.keys.auth : '';

  if (!endpoint || endpoint.length > 2048) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    // Nome de máquina sem ponto (localhost, pwa, n8n) é rede interna.
    if (!url.hostname.includes('.')) return null;
  } catch {
    return null;
  }

  if (!BASE64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return null;
  if (!BASE64URL.test(auth) || auth.length < 16 || auth.length > 32) return null;

  return { endpoint, chaves: { p256dh, auth } };
}
