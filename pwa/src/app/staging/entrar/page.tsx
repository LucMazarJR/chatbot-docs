import { redirect } from 'next/navigation';

import { FormularioEntrar } from '@/components/conta/FormularioEntrar';
import { contaAtual, googleConfigurado } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ apagada?: string }>;
}) {
  if (await contaAtual()) redirect('/staging');

  const { apagada } = await searchParams;

  return (
    <main className="st-pagina">
      <header className="st-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/avatar.png" alt="" width={56} height={56} />
        <h1>Assistente de Saúde</h1>
        <p>Entre para guardar suas conversas e receber avisos da equipe.</p>
      </header>

      {apagada === '1' && (
        <p className="st-aviso-ok" role="status">
          Sua conta e suas conversas foram apagadas.
        </p>
      )}

      <FormularioEntrar googleAtivo={googleConfigurado()} />
    </main>
  );
}
