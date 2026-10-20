'use client';

import type { ReactNode } from 'react';

import { podeVoltarAoChat } from '@/lib/navegacao';

/**
 * O "voltar" das páginas do staging: pelo histórico quando o chat está lá
 * atrás, e abrindo o endereço quando a página foi aberta direto.
 *
 * Um link comum empilhava o chat por cima da página, e o voltar do celular,
 * em seguida, reabria a página de onde a pessoa tinha acabado de sair.
 */
export function VoltarParaConversa({
  href = '/staging',
  rotulo,
  children,
}: {
  href?: string;
  /** Nome para o leitor de tela, quando o conteúdo é só um ícone. */
  rotulo?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={rotulo}
      onClick={(evento) => {
        if (!podeVoltarAoChat()) return;
        evento.preventDefault();
        window.history.back();
      }}
    >
      {children}
    </a>
  );
}
