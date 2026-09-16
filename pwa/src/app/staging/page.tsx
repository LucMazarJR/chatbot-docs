import { redirect } from 'next/navigation';

import { Conversa } from '@/components/Conversa';
import { contaAtual } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

/**
 * O chat com conta.
 *
 * É o mesmo componente do `/`, no modo conta: a conversa é retomada do
 * servidor, em qualquer aparelho, e cai nas mesmas coleções — aparece no painel
 * de conversas e entra na curadoria como qualquer outra.
 */
export default async function Staging() {
  if (!(await contaAtual())) redirect('/staging/entrar');

  return (
    <Conversa
      modo="conta"
      itensDeMenu={[{ rotulo: 'Minha conta', href: '/staging/conta' }]}
    />
  );
}
