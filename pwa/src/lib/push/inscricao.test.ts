import { describe, expect, it } from 'vitest';

import { idDaInscricao, validarInscricao } from './inscricao';

const valida = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

describe('inscrição de push', () => {
  it('aceita o formato que o navegador manda', () => {
    expect(validarInscricao(valida)).toEqual({ endpoint: valida.endpoint, chaves: valida.keys });
  });

  it('recusa endpoint que não é HTTPS, ou que aponta para a rede interna', () => {
    expect(validarInscricao({ ...valida, endpoint: 'http://fcm.googleapis.com/x' })).toBeNull();
    expect(validarInscricao({ ...valida, endpoint: 'https://localhost/x' })).toBeNull();
    expect(validarInscricao({ ...valida, endpoint: 'https://n8n:5678/webhook' })).toBeNull();
    expect(validarInscricao({ ...valida, endpoint: 'nao e url' })).toBeNull();
  });

  it('recusa chaves fora do formato', () => {
    expect(validarInscricao({ ...valida, keys: { ...valida.keys, p256dh: 'curta' } })).toBeNull();
    expect(validarInscricao({ ...valida, keys: { ...valida.keys, auth: 'tem espaço aqui!!!!!' } })).toBeNull();
    expect(validarInscricao({ endpoint: valida.endpoint })).toBeNull();
    expect(validarInscricao(null)).toBeNull();
  });

  it('o id é estável para o mesmo endpoint e não o contém', () => {
    expect(idDaInscricao(valida.endpoint)).toBe(idDaInscricao(valida.endpoint));
    expect(idDaInscricao(valida.endpoint)).not.toContain('fcm');
  });
});
