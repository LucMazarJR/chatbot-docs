'use client';

import { useEffect, useState } from 'react';

import { ETAPAS, TEXTO_DA_ETAPA, trechosDaBarra, type EtapaDaResposta } from '@/lib/etapas-da-resposta';

/** De quanto em quanto tempo o trecho atual anda. O CSS suaviza o salto entre um passo e outro. */
const PASSO_MS = 400;

/**
 * Staging: no lugar do balão de "digitando", uma barra em três trechos, um
 * por etapa da resposta, com a frase da etapa em cima.
 *
 * Não é balão de propósito: no balão branco, a espera parecia uma mensagem do
 * assistente. O trecho atual enche devagar e tem um brilho que corre, para a
 * tela nunca parecer parada, e o trecho de uma etapa só completa quando chega
 * o aviso da seguinte.
 */
export function ProgressoDaResposta({ etapa }: { etapa: EtapaDaResposta }) {
  const [passou, setPassou] = useState({ etapa, ms: 0 });

  useEffect(() => {
    const inicio = Date.now();
    const relogio = setInterval(() => setPassou({ etapa, ms: Date.now() - inicio }), PASSO_MS);
    return () => clearInterval(relogio);
  }, [etapa]);

  // Logo depois da troca, o relógio guardado ainda é o da etapa anterior.
  const trechos = trechosDaBarra(etapa, passou.etapa === etapa ? passou.ms : 0);

  return (
    // `aria-hidden`: quem anuncia a etapa é o cabeçalho, que é role="status".
    // Sem isto os dois falariam, e o leitor de tela repetiria a frase a cada
    // passo da barra.
    <div className="linha entrada-linha digitando" aria-hidden="true">
      <div className="progresso">
        {/* A chave muda com a etapa: a frase nova entra deslizando, em vez de trocar seca. */}
        <span key={etapa} className="progresso-frase">
          {TEXTO_DA_ETAPA[etapa]}
        </span>
        <div className="progresso-trilho">
          {ETAPAS.map((nome, indice) => (
            <span key={nome} className={nome === etapa ? 'progresso-trecho atual' : 'progresso-trecho'}>
              <i style={{ width: `${trechos[indice] * 100}%` }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
