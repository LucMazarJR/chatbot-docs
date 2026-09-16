import { redirect } from 'next/navigation';

import { PainelConta } from '@/components/conta/PainelConta';
import { contaAtual } from '@/lib/conta/servidor';
import { contaPublica } from '@/lib/conta/sessao';

export const dynamic = 'force-dynamic';

export default async function Conta() {
  const usuario = await contaAtual();
  if (!usuario) redirect('/staging/entrar');

  return (
    <main className="st-pagina">
      <PainelConta conta={contaPublica(usuario)} />
    </main>
  );
}
