import { juntarAnteriores, lerEntendimento, montarPromptDeEntendimento, precisaDaConversa } from './continuacao';

describe('precisaDaConversa', () => {
  it('reconhece a pergunta que emenda na anterior', () => {
    expect(precisaDaConversa('E fralda geriatrica?')).toBe(true);
    expect(precisaDaConversa('Mas, é preciso um encaminhamento de um médico? Pode ser um clínico?')).toBe(true);
    expect(precisaDaConversa('E A TIZAPARTIDA POSSO PEGAR COMO?')).toBe(true);
  });

  it('reconhece a pergunta que aponta para algo dito antes', () => {
    expect(precisaDaConversa('como chego la ?')).toBe(true);
    expect(precisaDaConversa('Eles abrem no fds?')).toBe(true);
    expect(precisaDaConversa('Lá tem atendimento de pronto socorro?')).toBe(true);
  });

  it('trata a pergunta curta como dependente da conversa', () => {
    expect(precisaDaConversa('Tem telefone?')).toBe(true);
    expect(precisaDaConversa('Já tenho encaminhamento')).toBe(true);
  });

  it('deixa sozinha a pergunta que se entende sem a conversa', () => {
    expect(precisaDaConversa('quem pode tomar a vacina específica pneumo-20 ?')).toBe(false);
    expect(precisaDaConversa('Qual o número de telefone da ubs estação?')).toBe(false);
    expect(precisaDaConversa('Onde consigo realizar uma tomografia?')).toBe(false);
    expect(precisaDaConversa('   ')).toBe(false);
  });
});

describe('entendimento das continuações', () => {
  it('monta um item por continuação, com o que veio antes', () => {
    const prompt = montarPromptDeEntendimento([{ pergunta: 'como chego la?', anterior: 'aeroporto' }]);
    expect(prompt).toContain('1. Antes: aeroporto\n   Pergunta: "como chego la?"');
  });

  it('lê as perguntas reescritas na ordem dos itens', () => {
    const lidas = lerEntendimento({ perguntas: [{ item: 2, pergunta: ' B ' }, { item: 1, pergunta: 'A' }] }, 2);
    expect(lidas).toEqual(['A', 'B']);
  });

  it('item que faltou, veio vazio ou fora da lista fica nulo', () => {
    expect(lerEntendimento({ perguntas: [{ item: 1, pergunta: '' }, { item: 7, pergunta: 'X' }] }, 2)).toEqual([null, null]);
    expect(lerEntendimento(null, 2)).toEqual([null, null]);
    expect(lerEntendimento({ grupos: [] }, 1)).toEqual([null]);
  });
});

describe('juntarAnteriores', () => {
  it('junta da mais antiga para a mais recente', () => {
    expect(juntarAnteriores(['aeroporto', 'ata e como chego la'])).toBe('aeroporto → ata e como chego la');
  });
});
