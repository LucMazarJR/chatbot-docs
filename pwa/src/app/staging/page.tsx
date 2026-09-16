import { redirect } from 'next/navigation';

import { contaAtual } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

/** Entrada do staging: quem tem conta vai para ela, quem não tem vai entrar. */
export default async function Staging() {
  const conta = await contaAtual();
  redirect(conta ? '/staging/conta' : '/staging/entrar');
}
