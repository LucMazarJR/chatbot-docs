import { describe, expect, it } from 'vitest';

import { chaveDeUnidade, filtrarUnidades, unidadeSemDuvida, type Unidade } from './unidades';

const LISTA: Unidade[] = [
  { id: '1', nome: 'UBS Aeroporto I' },
  { id: '2', nome: 'UBS Aeroporto III' },
  { id: '3', nome: 'ESF Santa Terezinha' },
  { id: '4', nome: 'UBS Centro' },
  { id: '5', nome: 'UBS Jardim São Luiz' },
  { id: '6', nome: 'ESF Palma' },
];

const nomes = (lista: Unidade[]) => lista.map((u) => u.nome);

describe('filtrarUnidades', () => {
  it('campo vazio mostra a lista inteira, em ordem alfabética', () => {
    expect(nomes(filtrarUnidades(LISTA, ''))).toEqual([
      'ESF Palma', 'ESF Santa Terezinha', 'UBS Aeroporto I', 'UBS Aeroporto III', 'UBS Centro', 'UBS Jardim São Luiz',
    ]);
  });

  it('ignora acento, maiúscula e a ordem das palavras', () => {
    expect(nomes(filtrarUnidades(LISTA, 'terez STA'))).toEqual(['ESF Santa Terezinha']);
    expect(nomes(filtrarUnidades(LISTA, 'sao luiz'))).toEqual(['UBS Jardim São Luiz']);
  });

  it('acha pelo começo de qualquer palavra do nome', () => {
    expect(nomes(filtrarUnidades(LISTA, 'aero'))).toEqual(['UBS Aeroporto I', 'UBS Aeroporto III']);
  });

  it('quem digita "jardim" ou "centro" vê essas unidades', () => {
    expect(nomes(filtrarUnidades(LISTA, 'jardim'))).toEqual(['UBS Jardim São Luiz']);
    expect(nomes(filtrarUnidades(LISTA, 'centro'))).toEqual(['UBS Centro']);
  });

  it('só "UBS" não filtra nada nem mostra a lista toda', () => {
    expect(filtrarUnidades(LISTA, 'ubs')).toEqual([]);
  });

  it('respeita o máximo de sugestões', () => {
    expect(filtrarUnidades(LISTA, '', 2)).toHaveLength(2);
  });
});

describe('unidadeSemDuvida', () => {
  it('reconhece a mesma unidade escrita de outro jeito', () => {
    expect(unidadeSemDuvida(LISTA, 'posto aeroporto 3')?.id).toBe('2');
    expect(unidadeSemDuvida(LISTA, 'palma')?.id).toBe('6');
  });

  it('aceita o começo do nome quando só uma unidade combina', () => {
    expect(unidadeSemDuvida(LISTA, 'terezi')?.id).toBe('3');
  });

  it('não escolhe quando há mais de uma possível', () => {
    expect(unidadeSemDuvida(LISTA, 'aeroporto')).toBeNull();
  });

  it('não escolhe com poucas letras', () => {
    expect(unidadeSemDuvida(LISTA, 'pa')).toBeNull();
  });

  it('não escolhe o que não está na lista', () => {
    expect(unidadeSemDuvida(LISTA, 'Vila Industrial')).toBeNull();
  });
});

describe('chaveDeUnidade', () => {
  // Os mesmos casos de Dashboard-PetSaude/back/src/ubs/identificar-ubs.spec.ts:
  // se um lado mudar a regra, este teste acusa a diferença.
  it.each([
    ['UBS Aeroporto III', 'aeroporto iii'],
    ['ubs do aeroporto 3', 'aeroporto iii'],
    ['Posto de Saúde Aeroporto três', 'aeroporto iii'],
    ['  São   Sebastião ', 'sao sebastiao'],
    ['UBS Sta. Clara', 'santa clara'],
  ])('"%s" vira "%s", como no painel', (texto, chave) => expect(chaveDeUnidade(texto)).toBe(chave));

  it('dá a mesma chave do painel para grafias da mesma unidade', () => {
    expect(chaveDeUnidade('UBS Aeroporto III')).toBe(chaveDeUnidade('posto do aeroporto 3'));
  });
});
