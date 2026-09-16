import { describe, expect, it } from 'vitest';

import { montarConteudo, tipoValido, TIPOS_DE_NOTIFICACAO } from './tipos';

const base = { _id: 'n1', detalhe: 'Exame de sangue amanhã às 7h, em jejum de 8 horas.' };

describe('conteúdo do push', () => {
  it('por padrão, a tela bloqueada NÃO mostra do que é o lembrete', () => {
    for (const tipo of ['lembrete-exame', 'lembrete-consulta'] as const) {
      const conteudo = montarConteudo({ ...base, tipo, mostrarDetalhe: false }, 'r');
      const visivel = `${conteudo.titulo} ${conteudo.corpo}`.toLowerCase();

      expect(visivel).not.toContain('sangue');
      expect(visivel).not.toContain('jejum');
      // Nem o tipo: "lembrete de exame" já diz mais do que precisa.
      expect(visivel).not.toContain('exame');
      expect(visivel).not.toContain('consulta');
    }
  });

  it('com mostrarDetalhe, o detalhe vai para a notificação', () => {
    const conteudo = montarConteudo({ ...base, tipo: 'aviso', mostrarDetalhe: true }, 'r');
    expect(conteudo.corpo).toBe(base.detalhe);
  });

  it('corta detalhe longo, para caber no limite do protocolo', () => {
    const conteudo = montarConteudo({ ...base, tipo: 'aviso', mostrarDetalhe: true, detalhe: 'x'.repeat(1000) }, 'r');
    expect(conteudo.corpo.length).toBeLessThanOrEqual(180);
    expect(Buffer.byteLength(JSON.stringify(conteudo))).toBeLessThan(4000);
  });

  it('o toque leva à tela do aviso, e a tag evita notificação duplicada', () => {
    const conteudo = montarConteudo({ ...base, tipo: 'teste', mostrarDetalhe: false }, 'recibo-1');
    expect(conteudo.url).toBe('/staging/avisos/n1');
    expect(conteudo.tag).toBe('aviso-n1');
    expect(conteudo.recibo).toBe('recibo-1');
  });

  it('só aceita os tipos registrados', () => {
    expect(TIPOS_DE_NOTIFICACAO.every(tipoValido)).toBe(true);
    expect(tipoValido('campanha')).toBe(false);
    expect(tipoValido(undefined)).toBe(false);
  });
});
