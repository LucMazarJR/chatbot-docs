'use client';

import type { Unidade } from '@/lib/unidades';

/** Uma linha da lista: uma unidade, ou "outra" com o que a pessoa digitou. */
export type OpcaoDeUnidade = { tipo: 'unidade'; unidade: Unidade } | { tipo: 'outra'; texto: string };

export const ID_DA_LISTA_DE_UNIDADES = 'lista-de-unidades';

export function idDaOpcao(indice: number) {
  return `opcao-unidade-${indice}`;
}

/**
 * As unidades de saúde, acima do campo, enquanto a pergunta da unidade está aberta.
 *
 * LÓGICA DO LUCIANO: é a lista de menções do WhatsApp (o "@" num grupo), que
 * aparece colada em cima do campo e filtra conforme se digita. Quem já usa o
 * WhatsApp reconhece. Com o campo vazio, a lista mostra todas as unidades: quem
 * não sabe escrever o nome acha rolando. Quando a unidade não está na lista, a
 * última linha é "Outra unidade" com o que a pessoa escreveu, e a equipe
 * identifica no painel.
 *
 * O toque usa `onPointerDown` com `preventDefault`: sem isso, o campo perde o
 * foco antes do clique, o teclado do celular fecha, a lista sobe de lugar e o
 * toque cai na linha errada.
 */
export function SugestoesDeUnidade({
  opcoes,
  destacada,
  aoEscolher,
}: {
  opcoes: OpcaoDeUnidade[];
  destacada: number;
  aoEscolher: (opcao: OpcaoDeUnidade) => void;
}) {
  if (opcoes.length === 0) return null;

  return (
    <ul id={ID_DA_LISTA_DE_UNIDADES} className="sugestoes-unidade" role="listbox" aria-label="Unidades de saúde">
      {opcoes.map((opcao, indice) => (
        <li
          key={opcao.tipo === 'unidade' ? opcao.unidade.id : 'outra'}
          id={idDaOpcao(indice)}
          role="option"
          aria-selected={indice === destacada}
          className={[opcao.tipo === 'outra' ? 'outra' : '', indice === destacada ? 'destacada' : ''].join(' ').trim() || undefined}
          onPointerDown={(evento) => evento.preventDefault()}
          onClick={() => aoEscolher(opcao)}
        >
          {opcao.tipo === 'unidade' ? (
            opcao.unidade.nome
          ) : (
            <>
              <span className="rotulo-outra">Outra unidade:</span> “{opcao.texto}”
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
