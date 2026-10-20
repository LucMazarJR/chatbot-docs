'use client';

import { useCallback, useEffect, useRef } from 'react';

import { criarCamadas } from './camadas';

let camadas: ReturnType<typeof criarCamadas> | null = null;

/** Uma pilha só para a página inteira, ligada ao histórico do navegador. */
function pilhaDaPagina() {
  if (!camadas) {
    camadas = criarCamadas({
      // `null` e sem endereço: o Next integra o pushState nativo ao roteador,
      // e a entrada nova fica na mesma página.
      empilhar: () => window.history.pushState(null, ''),
      voltar: () => window.history.back(),
      endereco: () => window.location.pathname + window.location.search,
      // Chamada solta, e não como método do objeto: o navegador recusa
      // `queueMicrotask` com outro `this` ("Illegal invocation").
      depois: (tarefa) => queueMicrotask(tarefa),
    });
    const pilha = camadas;
    window.addEventListener('popstate', () => pilha.aoVoltar());
  }
  return camadas;
}

/**
 * Faz o voltar do celular fechar esta camada (ver `camadas.ts`).
 *
 * `ativo` falso deixa tudo como era: é o que o `/`, em uso, recebe.
 * `sair` é para o link de dentro da camada, que deve usar `replace`: a página
 * nova ocupa a entrada da camada, e o voltar de lá cai direto no chat.
 */
export function useVoltarFecha(aberto: boolean, fechar: () => void, ativo: boolean) {
  const fecharRef = useRef(fechar);
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    fecharRef.current = fechar;
  });

  useEffect(() => {
    if (!ativo || !aberto) return;
    const pilha = pilhaDaPagina();
    const id = pilha.abrir(() => fecharRef.current());
    idRef.current = id;
    return () => {
      idRef.current = null;
      pilha.soltar(id);
    };
  }, [aberto, ativo]);

  const sair = useCallback(() => {
    if (idRef.current !== null) pilhaDaPagina().sair(idRef.current);
  }, []);

  return { sair };
}
