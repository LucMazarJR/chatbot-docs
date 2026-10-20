import { describe, expect, it } from 'vitest';

import { criarVez } from './som-unico';

describe('um som por vez', () => {
  it('tomar a vez para o som anterior', () => {
    const vez = criarVez();
    const parados: string[] = [];
    vez.tomar(() => parados.push('primeiro'));
    vez.tomar(() => parados.push('segundo'));
    expect(parados).toEqual(['primeiro']);
  });

  it('o áudio que ainda estava preparando perde a vez e não toca ao chegar', () => {
    const vez = criarVez();
    const lento = vez.tomar(() => {});
    const rapido = vez.tomar(() => {});
    expect(vez.aindaE(lento)).toBe(false);
    expect(vez.aindaE(rapido)).toBe(true);
  });

  it('o som que terminou sozinho não é parado de novo', () => {
    const vez = criarVez();
    let parado = 0;
    const token = vez.tomar(() => parado++);
    vez.soltar(token);
    vez.tomar(() => {});
    expect(parado).toBe(0);
  });

  it('soltar com a vez já tomada por outro não tira a vez dele', () => {
    const vez = criarVez();
    const antigo = vez.tomar(() => {});
    const novo = vez.tomar(() => {});
    vez.soltar(antigo);
    expect(vez.aindaE(novo)).toBe(true);
  });

  it('parar tudo, ao gravar, para o que estiver tocando', () => {
    const vez = criarVez();
    let parado = false;
    const token = vez.tomar(() => (parado = true));
    vez.pararTudo();
    expect(parado).toBe(true);
    expect(vez.aindaE(token)).toBe(false);
  });
});
