import { describe, expect, it } from 'vitest';

import { conferirSenha, gerarHashDeSenha } from './senha';

describe('senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await gerarHashDeSenha('uma senha comprida');

    expect(await conferirSenha('uma senha comprida', hash)).toBe(true);
    expect(await conferirSenha('uma senha comprid', hash)).toBe(false);
  });

  it('grava os parâmetros junto, para poder aumentá-los sem invalidar as senhas antigas', async () => {
    const hash = await gerarHashDeSenha('qualquer coisa');

    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '32768', '8', '1']);
  });

  it('usa um salt por senha: a mesma senha nunca gera o mesmo hash', async () => {
    expect(await gerarHashDeSenha('repetida')).not.toBe(await gerarHashDeSenha('repetida'));
  });

  it('recusa quando a conta não tem senha, mesmo que o texto bata com o hash falso', async () => {
    expect(await conferirSenha('', null)).toBe(false);
    expect(await conferirSenha('qualquer', null)).toBe(false);
  });

  it('aceita a mesma senha digitada com acentos compostos de jeitos diferentes', async () => {
    const composta = 'café com leite';
    const precomposta = 'café com leite';
    const hash = await gerarHashDeSenha(precomposta);

    expect(await conferirSenha(composta, hash)).toBe(true);
  });

  it('recusa hash adulterado em vez de alocar o que ele pedir', async () => {
    const adulterado = 'scrypt$1073741824$8$1$c2FsdA$aGFzaA';

    expect(await conferirSenha('x', adulterado)).toBe(false);
    expect(await conferirSenha('x', 'bcrypt$qualquer')).toBe(false);
  });
});
