import { describe, expect, it } from 'vitest';

import { estaNaHora, idsAtivos, loteDaRodada, montarNotificacao, prepararAvisos } from './regras';
import { definirGatilho } from './tipos';

const agora = new Date('2026-09-23T13:00:00Z');
const hora = 60 * 60 * 1000;
const aviso = (extra: Record<string, unknown> = {}) => ({
  usuarioId: 'u1',
  chave: 'consulta-1',
  detalhe: 'Sua consulta é amanhã às 9h.',
  validaAte: new Date(agora.getTime() + 24 * hora),
  ...extra,
});

describe('idsAtivos', () => {
  it('vazio ou ausente desliga todos', () => {
    expect(idsAtivos(undefined)).toEqual([]);
    expect(idsAtivos('')).toEqual([]);
    expect(idsAtivos(' , ')).toEqual([]);
  });

  it('aceita espaço, maiúscula e repetição', () => {
    expect(idsAtivos(' Boas-Vindas, consulta-amanha,boas-vindas ')).toEqual([
      'boas-vindas',
      'consulta-amanha',
    ]);
  });
});

describe('estaNaHora', () => {
  it('roda na primeira vez', () => {
    expect(estaNaHora(null, 60, agora)).toBe(true);
  });

  it('espera o intervalo inteiro', () => {
    expect(estaNaHora(new Date(agora.getTime() - 59 * 60 * 1000), 60, agora)).toBe(false);
    expect(estaNaHora(new Date(agora.getTime() - 60 * 60 * 1000), 60, agora)).toBe(true);
  });
});

describe('prepararAvisos', () => {
  it('deixa passar o aviso completo, com envio agora quando não diz quando', () => {
    const { validos, descartes } = prepararAvisos([aviso()], agora);
    expect(descartes).toEqual([]);
    expect(validos[0].enviarEm).toEqual(agora);
  });

  it('descarta o que ficaria parado ou chegaria errado', () => {
    const { validos, descartes } = prepararAvisos(
      [
        aviso({ chave: '' }),
        aviso({ chave: 'a', usuarioId: '' }),
        aviso({ chave: 'b', detalhe: '   ' }),
        aviso({ chave: 'c', validaAte: new Date(agora.getTime() - 1) }),
        aviso({ chave: 'd', enviarEm: new Date(agora.getTime() + 48 * hora) }),
        aviso({ chave: 'e', detalhe: 'x'.repeat(1001) }),
        aviso({ chave: 'f', validaAte: 'amanhã' }),
      ],
      agora,
    );
    expect(validos).toEqual([]);
    expect(descartes.map((d) => d.motivo)).toEqual([
      'sem chave',
      'sem usuarioId',
      'sem texto',
      'validade já passou',
      'validade termina antes do envio',
      'texto com mais de 1000 caracteres',
      'sem validade',
    ]);
  });

  it('a mesma chave duas vezes na mesma verificação vira um aviso só', () => {
    const { validos, descartes } = prepararAvisos([aviso(), aviso()], agora);
    expect(validos).toHaveLength(1);
    expect(descartes[0].motivo).toBe('chave repetida na mesma verificação');
  });

  it('para no teto por rodada', () => {
    const muitos = Array.from({ length: 5 }, (_, i) => aviso({ chave: `k${i}` }));
    const { validos, descartes } = prepararAvisos(muitos, agora, 3);
    expect(validos).toHaveLength(3);
    expect(descartes).toHaveLength(2);
  });

  it('o motivo do descarte nunca traz o texto do aviso', () => {
    const { descartes } = prepararAvisos([aviso({ chave: 'z', usuarioId: '' })], agora);
    expect(JSON.stringify(descartes)).not.toContain('consulta é amanhã');
  });
});

describe('montarNotificacao', () => {
  it('monta o documento inteiro da fila, pendente e discreto por padrão', () => {
    const gatilho = definirGatilho({
      id: 'consulta-amanha',
      descricao: 'teste',
      aCadaMinutos: 60,
      tipo: 'lembrete-consulta',
      verificar: async () => [],
    });
    const lote = loteDaRodada(gatilho.id, agora);
    const doc = montarNotificacao(gatilho, { ...aviso(), enviarEm: agora }, agora, lote, 'id-1');

    expect(lote).toBe('gatilho:consulta-amanha:2026-09-23T13:00');
    expect(doc).toMatchObject({
      _id: 'id-1',
      loteId: lote,
      tipo: 'lembrete-consulta',
      estado: 'pendente',
      tentativas: 0,
      mostrarDetalhe: false,
      criadaPor: 'Gatilho: consulta-amanha',
      entregas: [],
    });
    // Os campos que o despachante procura precisam existir, nem que nulos.
    for (const campo of ['travadaAte', 'recibo', 'motivo', 'enviadaEm', 'exibidaEm', 'abertaEm', 'expiraEm']) {
      expect(doc).toHaveProperty(campo, null);
    }
  });
});

describe('definirGatilho', () => {
  it('recusa id que não bateria com o que se escreve na variável', () => {
    const base = { descricao: '', aCadaMinutos: 5, tipo: 'aviso' as const, verificar: async () => [] };
    expect(() => definirGatilho({ ...base, id: 'Consulta Amanhã' })).toThrow(/id inválido/);
    expect(() => definirGatilho({ ...base, id: 'ok', aCadaMinutos: 0 })).toThrow(/aCadaMinutos/);
  });
});
