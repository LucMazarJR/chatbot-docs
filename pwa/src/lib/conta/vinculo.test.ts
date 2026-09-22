import { describe, expect, it } from 'vitest';

import type { Usuario } from './tipos';
import { decidirVinculo, type PerfilGoogle } from './vinculo';

const perfil: PerfilGoogle = { sub: 'google-123', email: 'ana@exemplo.com', nome: 'Ana' };

function usuario(dados: Partial<Usuario>): Usuario {
  return {
    _id: 'u1',
    email: 'ana@exemplo.com',
    emailNormalizado: 'ana@exemplo.com',
    emailVerificado: false,
    senhaHash: 'scrypt$...',
    googleSub: null,
    nome: null,
    consentimentoEm: new Date(),
    criadoEm: new Date(),
    ...dados,
  };
}

describe('decidirVinculo', () => {
  it('entra na conta já ligada a este Google, mesmo com outro e-mail', () => {
    const ligada = usuario({ googleSub: 'google-123', email: 'antigo@exemplo.com' });
    expect(decidirVinculo(ligada, null, perfil)).toEqual({ acao: 'entrar', usuario: ligada });
  });

  it('o sub vence o e-mail quando os dois acham contas diferentes', () => {
    const ligada = usuario({ _id: 'u1', googleSub: 'google-123' });
    const outra = usuario({ _id: 'u2' });
    expect(decidirVinculo(ligada, outra, perfil)).toMatchObject({ acao: 'entrar', usuario: { _id: 'u1' } });
  });

  it('vincula conta de senha com e-mail já provado, mantendo a senha', () => {
    const conta = usuario({ emailVerificado: true });
    expect(decidirVinculo(null, conta, perfil)).toEqual({
      acao: 'vincular',
      usuario: conta,
      revogarSenha: false,
    });
  });

  it('vincula conta de senha com e-mail nunca provado revogando a senha', () => {
    // Quem cadastrou pode ter digitado o e-mail de outra pessoa.
    const conta = usuario({ emailVerificado: false });
    expect(decidirVinculo(null, conta, perfil)).toEqual({
      acao: 'vincular',
      usuario: conta,
      revogarSenha: true,
    });
  });

  it('recusa quando o e-mail já está ligado a outro Google', () => {
    const conta = usuario({ googleSub: 'google-999', emailVerificado: true });
    expect(decidirVinculo(null, conta, perfil)).toEqual({ acao: 'conflito' });
  });

  it('cria a conta quando ninguém corresponde: entrar e criar são o mesmo toque', () => {
    expect(decidirVinculo(null, null, perfil)).toEqual({ acao: 'criar' });
  });
});
