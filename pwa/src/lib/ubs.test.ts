import { describe, expect, it } from 'vitest';

import { pareceNomeDeUbs } from './ubs';

describe('resposta à pergunta da UBS', () => {
  it.each(['UBS Aeroporto III', 'aeroporto 3', 'sta terezinha', 'Posto do Horto', 'ubs sao sebastiao'])(
    'aceita "%s" como nome',
    (texto) => expect(pareceNomeDeUbs(texto)).toBe(true),
  );

  it.each([
    'qual o horário da vacina?',
    'como marcar consulta',
    'Quero saber sobre a dengue',
    'meu filho está com febre há três dias e não melhora',
  ])('deixa "%s" seguir como pergunta', (texto) => expect(pareceNomeDeUbs(texto)).toBe(false));

  it('não guarda número de documento nem telefone', () => {
    expect(pareceNomeDeUbs('123.456.789-00')).toBe(false);
    expect(pareceNomeDeUbs('12345678900')).toBe(false);
    expect(pareceNomeDeUbs('16 99999 8888')).toBe(false);
    expect(pareceNomeDeUbs('UBS 12')).toBe(true);
  });

  it('não aceita vazio nem texto enorme', () => {
    expect(pareceNomeDeUbs('   ')).toBe(false);
    expect(pareceNomeDeUbs('a'.repeat(61))).toBe(false);
  });
});
