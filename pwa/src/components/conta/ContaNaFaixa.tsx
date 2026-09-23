'use client';

import { useState } from 'react';

/**
 * Quem está logado, e a saída, na faixa do topo.
 *
 * LÓGICA DO LUCIANO: sair estava só dentro de "Minha conta" e no menu do chat.
 * Quem estava na tela de avisos, ou lendo uma conversa antiga, não tinha saída
 * à vista, e num posto de saúde o aparelho é emprestado com frequência. A faixa
 * já existe em toda tela do staging, então a saída passa a existir junto, sem
 * custar altura nenhuma.
 *
 * O e-mail some nas telas mais estreitas: entre saber de quem é a sessão e
 * conseguir sair dela, sair importa mais.
 */
export function ContaNaFaixa({ email }: { email: string }) {
  const [saindo, setSaindo] = useState(false);

  function sair() {
    setSaindo(true);
    // Sem tratar erro: o cookie é o que vale, e a tela de entrar recomeça a
    // sessão de qualquer jeito.
    void fetch('/api/conta/sair', { method: 'POST' }).finally(() =>
      window.location.assign('/staging/entrar'),
    );
  }

  return (
    <span className="st-faixa-conta">
      <span className="st-faixa-email" title={email}>
        {email}
      </span>
      <button type="button" onClick={sair} disabled={saindo}>
        {saindo ? 'Saindo…' : 'Sair'}
      </button>
    </span>
  );
}
