import type { Metadata } from 'next';

import './staging.css';

/**
 * Moldura do ambiente de testes.
 *
 * LÓGICA DO LUCIANO: `/staging` é onde contas, chat com conta e avisos são
 * validados sem tocar no `/`, que está em teste de campo. Não é um ambiente
 * separado — mesmo app, mesmo banco, as mesmas FAQs —, então a separação é só
 * de rota: nada no `/` aponta para cá, e os buscadores são mandados embora.
 *
 * Promover o que der certo para o `/` é mover estas páginas; os dados já são os
 * definitivos.
 */
export const metadata: Metadata = {
  title: 'Assistente de Saúde · testes',
  robots: { index: false, follow: false },
};

export default function LayoutStaging({ children }: { children: React.ReactNode }) {
  return (
    <div className="st">
      <p className="st-faixa">Ambiente de testes — contas e avisos em validação</p>
      <div className="st-conteudo">{children}</div>
    </div>
  );
}
