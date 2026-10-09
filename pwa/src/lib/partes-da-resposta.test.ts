import { describe, expect, it } from 'vitest';
import { classificarResposta, lerPartes } from './partes-da-resposta';

const parte = (pergunta: string, respondida: boolean, faqIds: string[] = []) => ({ pergunta, respondida, faqIds });

describe('lerPartes', () => {
  it('aceita as partes que o fluxo manda', () => {
    expect(lerPartes([parte('Onde fica a UBS Estação?', true, ['abc'])])).toEqual([
      { pergunta: 'Onde fica a UBS Estação?', respondida: true, faqIds: ['abc'] },
    ]);
  });

  it('devolve null quando o fluxo não mandou partes', () => {
    expect(lerPartes(undefined)).toBeNull();
    expect(lerPartes(null)).toBeNull();
    expect(lerPartes([])).toBeNull();
  });

  it('devolve null quando uma parte não dá para ler, e quem decide é o texto', () => {
    expect(lerPartes([{ pergunta: 'x', respondida: 'sim' }])).toBeNull();
    expect(lerPartes([{ respondida: true }])).toBeNull();
    expect(lerPartes(['texto solto'])).toBeNull();
  });

  it('corta o que é grande e descarta id que não é texto', () => {
    const [lida] = lerPartes([{ pergunta: 'p'.repeat(900), respondida: false, faqIds: ['a', 7, null] }])!;
    expect(lida.pergunta).toHaveLength(400);
    expect(lida.faqIds).toEqual(['a']);
  });

  it('guarda no máximo 3 partes', () => {
    const partes = Array.from({ length: 5 }, (_, i) => parte(`Pergunta ${i}`, true));
    expect(lerPartes(partes)).toHaveLength(3);
  });
});

describe('classificarResposta', () => {
  it('com todas as partes respondidas, não é lacuna', () => {
    expect(classificarResposta('Fica na Av. Santos Dumont.', [parte('Onde fica?', true)])).toEqual({
      semResposta: false,
      partesSemResposta: [],
    });
  });

  it('com uma parte faltando, a resposta conta como dada e só a parte vai para a curadoria', () => {
    const partes = [parte('A vacina de herpes-zóster é oferecida no SUS?', true), parte('Com receita, onde posso tomar a vacina de herpes-zóster?', false)];
    expect(classificarResposta('A vacina... Sobre onde tomar, não encontrei.', partes)).toEqual({
      semResposta: false,
      partesSemResposta: ['Com receita, onde posso tomar a vacina de herpes-zóster?'],
    });
  });

  it('com todas faltando, é lacuna e cada parte vai separada para a curadoria', () => {
    const partes = [parte('Primeira?', false), parte('Segunda?', false)];
    expect(classificarResposta('Desculpe — não encontrei essa informação.', partes)).toEqual({
      semResposta: true,
      partesSemResposta: ['Primeira?', 'Segunda?'],
    });
  });

  it('sem partes, vale o texto fixo do "não encontrei", como no fluxo do /', () => {
    expect(classificarResposta('Desculpe — não encontrei essa informação.', null).semResposta).toBe(true);
    expect(classificarResposta('Desculpe - nao encontrei', null).semResposta).toBe(true);
    expect(classificarResposta('Olá, sou seu chatbot.', null)).toEqual({ semResposta: false, partesSemResposta: [] });
  });
});
