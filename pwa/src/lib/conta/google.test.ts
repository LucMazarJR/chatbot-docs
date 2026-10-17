import { describe, expect, it } from 'vitest';

import {
  conferirIdToken,
  cookieDoFluxo,
  desafioPkce,
  lerCargaDoJwt,
  lerFluxo,
  novoFluxo,
  origemPublica,
  urlDeAutorizacao,
} from './google';

describe('desafioPkce', () => {
  it('bate com o exemplo da RFC 7636', () => {
    expect(desafioPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('origemPublica', () => {
  it('usa os cabeçalhos do proxy, e não o endereço interno', () => {
    const requisicao = new Request('http://pwa:8080/api/conta/google', {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'chat.exemplo.org' },
    });
    expect(origemPublica(requisicao)).toBe('https://chat.exemplo.org');
  });

  it('sem proxy, usa o host da requisição', () => {
    const requisicao = new Request('http://localhost:8080/api/conta/google', { headers: { host: 'localhost:8080' } });
    expect(origemPublica(requisicao)).toBe('http://localhost:8080');
  });
});

describe('fluxo', () => {
  it('a URL leva state, nonce e o desafio S256, nunca o verificador', () => {
    const fluxo = novoFluxo();
    const url = new URL(urlDeAutorizacao(fluxo, 'cliente.apps.googleusercontent.com', 'https://x.org/volta'));

    expect(url.searchParams.get('state')).toBe(fluxo.state);
    expect(url.searchParams.get('nonce')).toBe(fluxo.nonce);
    expect(url.searchParams.get('code_challenge')).toBe(desafioPkce(fluxo.verificador));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.toString()).not.toContain(fluxo.verificador);
  });

  it('o cookie devolve o mesmo estado', () => {
    const fluxo = novoFluxo();
    const cookie = cookieDoFluxo(fluxo, true);
    const [par] = cookie.split(';');

    expect(lerFluxo(`outro=1; ${par}`)).toEqual(fluxo);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/api/conta/google');
  });

  it('cookie adulterado é ignorado', () => {
    expect(lerFluxo('pwa_google=nao-e-json')).toBeNull();
    expect(lerFluxo(null)).toBeNull();
  });
});

describe('conferirIdToken', () => {
  const agora = new Date('2026-09-16T12:00:00Z');
  const agoraS = Math.floor(agora.getTime() / 1000);
  const esperado = { clientId: 'cliente', nonce: 'n1', agora };
  const valida = {
    iss: 'https://accounts.google.com',
    aud: 'cliente',
    exp: agoraS + 3600,
    nonce: 'n1',
    sub: '1234',
    email: 'Ana@Exemplo.com',
    email_verified: true,
    given_name: 'Ana',
  };

  it('aceita o token certo e normaliza o e-mail', () => {
    expect(conferirIdToken(valida, esperado)).toEqual({
      ok: true,
      perfil: { sub: '1234', email: 'ana@exemplo.com', nome: 'Ana' },
    });
  });

  it.each([
    [{ iss: 'https://evil.example' }, 'emissor inesperado'],
    [{ aud: 'outro-app' }, 'token de outro aplicativo'],
    [{ exp: agoraS - 3600 }, 'token vencido'],
    [{ nonce: 'reaproveitado' }, 'nonce diferente'],
    [{ email_verified: false }, 'e-mail não verificado no Google'],
    [{ sub: '' }, 'sem sub'],
  ])('recusa %j', (troca, motivo) => {
    expect(conferirIdToken({ ...valida, ...troca }, esperado)).toEqual({ ok: false, motivo });
  });

  it('lê a carga de um JWT', () => {
    const jwt = ['cabecalho', Buffer.from(JSON.stringify(valida)).toString('base64url'), 'assinatura'].join('.');
    expect(lerCargaDoJwt(jwt)).toEqual(valida);
    expect(lerCargaDoJwt('nao.e.jwt')).toBeNull();
  });
});
