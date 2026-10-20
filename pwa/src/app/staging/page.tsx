import { redirect } from 'next/navigation';

import { Conversa } from '@/components/Conversa';
import { contaAtual } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

/**
 * O chat com conta.
 *
 * É o mesmo componente do `/`, no modo conta: a conversa é retomada do
 * servidor, em qualquer aparelho, e cai nas mesmas coleções: aparece no painel
 * de conversas e entra na curadoria como qualquer outra.
 */
export default async function Staging() {
  const conta = await contaAtual();
  if (!conta) redirect('/staging/entrar');

  return (
    <Conversa
      modo="conta"
      nome={conta.nome}
      comTutorial
      comVoz
      itensDeMenu={[
        { rotulo: 'Avisos', href: '/staging/avisos' },
        { rotulo: 'Minha conta', href: '/staging/conta' },
      ]}
    />
  );
}
