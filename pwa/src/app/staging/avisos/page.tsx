import { redirect } from 'next/navigation';

import { PainelAvisos } from '@/components/avisos/PainelAvisos';
import { contaAtual } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

export default async function Avisos() {
  if (!(await contaAtual())) redirect('/staging/entrar');

  return (
    <main className="st-pagina">
      <p className="st-voltar">
        <a href="/staging">← Voltar para a conversa</a>
      </p>

      <header className="st-marca">
        <h1>Avisos</h1>
        <p>Lembretes de exames e consultas, enviados pela equipe de saúde.</p>
      </header>

      <PainelAvisos />
    </main>
  );
}
