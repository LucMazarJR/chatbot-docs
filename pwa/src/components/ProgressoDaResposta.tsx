'use client';

import { useEffect, useState } from 'react';

import { ETAPAS, TEXTO_DA_ETAPA, trechosDaBarra, type EtapaDaResposta } from '@/lib/etapas-da-resposta';

/** De quanto em quanto tempo o trecho atual anda. O CSS suaviza o salto entre um passo e outro. */
const PASSO_MS = 400;

/**
 * Quanto o trecho que termina leva para chegar ao fim antes de o seguinte
 * começar. Um pouco acima da transição de `.progresso-trecho i` (0,45 s), para
 * o seguinte só sair quando o anterior já parou.
 */
const CONCLUIR_MS = 500;

/**
 * Staging: no lugar do balão de "digitando", uma caixa com a frase da etapa,
 * o passo ("2 de 3") e uma barra em três trechos, um por etapa da resposta.
 *
 * O trecho atual enche devagar e tem um brilho que corre, para a tela nunca
 * parecer parada, e o trecho de uma etapa só completa quando chega o aviso da
 * seguinte.
 */
export function ProgressoDaResposta({ etapa }: { etapa: EtapaDaResposta }) {
  const alvo = ETAPAS.indexOf(etapa);
  // A barra mostra uma etapa de cada vez, atrás da que chegou do fluxo: o
  // trecho que termina corre até o fim antes de o seguinte começar, e uma
  // etapa que a consulta de 2 s pulou inteira também passa pela barra.
  const [mostrada, setMostrada] = useState(alvo);
  const concluindo = alvo > mostrada;
  const [passou, setPassou] = useState({ mostrada, ms: 0 });

  useEffect(() => {
    if (!concluindo) return;
    const espera = setTimeout(() => setMostrada((atual) => atual + 1), CONCLUIR_MS);
    return () => clearTimeout(espera);
  }, [concluindo, mostrada]);

  useEffect(() => {
    const inicio = Date.now();
    const relogio = setInterval(() => setPassou({ mostrada, ms: Date.now() - inicio }), PASSO_MS);
    return () => clearInterval(relogio);
  }, [mostrada]);

  const nome = ETAPAS[mostrada];
  // Logo depois da troca, o relógio guardado ainda é o da etapa anterior.
  const trechos = trechosDaBarra(nome, passou.mostrada === mostrada ? passou.ms : 0, concluindo);

  return (
    // `aria-hidden`: quem anuncia a etapa é o cabeçalho, que é role="status".
    // Sem isto os dois falariam, e o leitor de tela repetiria a frase a cada
    // passo da barra.
    <div className="linha entrada-linha digitando" aria-hidden="true">
      <div className="progresso">
        <div className="progresso-topo">
          {/* A chave muda com a etapa: a frase nova entra deslizando, em vez de trocar seca. */}
          <span key={nome} className="progresso-frase">
            {TEXTO_DA_ETAPA[nome]}
          </span>
          <span className="progresso-passo">
            {mostrada + 1} de {ETAPAS.length}
          </span>
        </div>
        <div className="progresso-trilho">
          {ETAPAS.map((trecho, indice) => (
            <span key={trecho} className={indice === mostrada ? 'progresso-trecho atual' : 'progresso-trecho'}>
              <i style={{ width: `${trechos[indice] * 100}%` }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
