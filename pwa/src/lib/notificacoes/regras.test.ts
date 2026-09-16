import { describe, expect, it } from 'vitest';

import { classificarResposta, decidir, esperaAntesDaTentativa, ttlEmSegundos } from './regras';

const agora = new Date('2026-09-16T12:00:00Z');
const daqui = (minutos: number) => new Date(agora.getTime() + minutos * 60_000);

describe('regras do despachante', () => {
  it('não envia aviso vencido: com o PC desligado a noite toda, chegaria depois do exame', () => {
    expect(decidir(daqui(-1), agora)).toBe('expirar');
    expect(decidir(agora, agora)).toBe('expirar');
    expect(decidir(daqui(1), agora)).toBe('enviar');
  });

  it('inscrição morta não é insistida', () => {
    expect(classificarResposta(410)).toBe('inscricao-morta');
    expect(classificarResposta(404)).toBe('inscricao-morta');
    // Feita com outras chaves VAPID: também não volta.
    expect(classificarResposta(403)).toBe('inscricao-morta');
    expect(classificarResposta(401)).toBe('inscricao-morta');
  });

  it('sobrecarga e rede caída voltam para a fila', () => {
    expect(classificarResposta(429)).toBe('tentar-de-novo');
    expect(classificarResposta(503)).toBe('tentar-de-novo');
    expect(classificarResposta(null)).toBe('tentar-de-novo');
  });

  it('pedido malformado não é repetido: daria o mesmo erro', () => {
    expect(classificarResposta(400)).toBe('falhou');
    expect(classificarResposta(413)).toBe('falhou');
  });

  it('aceito é enviado', () => {
    expect(classificarResposta(201)).toBe('enviada');
  });

  it('espera cresce entre tentativas e para no teto', () => {
    const minutos = [1, 2, 3, 4, 9].map((t) => esperaAntesDaTentativa(t) / 60_000);
    expect(minutos).toEqual([1, 5, 15, 60, 60]);
  });

  it('o serviço de push guarda o aviso só até ele deixar de valer', () => {
    expect(ttlEmSegundos(daqui(30), agora)).toBe(1800);
    // Piso de 1 minuto e teto de 4 semanas, que é o que os serviços aceitam.
    expect(ttlEmSegundos(daqui(-5), agora)).toBe(60);
    expect(ttlEmSegundos(daqui(60 * 24 * 60), agora)).toBe(28 * 24 * 60 * 60);
  });
});
