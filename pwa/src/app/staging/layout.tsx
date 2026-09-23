import type { Metadata } from 'next';

import { RegistrarSWStaging } from '@/components/avisos/RegistrarSWStaging';
import { ContaNaFaixa } from '@/components/conta/ContaNaFaixa';
import { contaAtual } from '@/lib/conta/servidor';

import './staging.css';

/**
 * Moldura do ambiente de testes.
 *
 * LÓGICA DO LUCIANO: `/staging` é onde contas, chat com conta e avisos são
 * validados sem tocar no `/`, que está em teste de campo. Não é um ambiente
 * separado (mesmo app, mesmo banco, as mesmas FAQs), então a separação é só
 * de rota: nada no `/` aponta para cá, e os buscadores são mandados embora.
 *
 * Promover o que der certo para o `/` é mover estas páginas; os dados já são os
 * definitivos.
 */
export const metadata: Metadata = {
  title: 'Assistente de Saúde · testes',
  robots: { index: false, follow: false },
  // Manifest próprio, com escopo /staging/: instalado pela tela de início, o
  // app abre aqui e não no chat de campo. No iPhone, é essa instalação que
  // libera os avisos.
  manifest: '/staging/manifest.webmanifest',
};

export default async function LayoutStaging({ children }: { children: React.ReactNode }) {
  // A faixa é o único lugar presente em toda tela daqui, inclusive no chat, que
  // ocupa a altura inteira. Por isso a saída mora nela.
  const conta = await contaAtual();

  return (
    <div className="st">
      <RegistrarSWStaging />
      <div className="st-faixa">
        <span className="st-faixa-texto">Ambiente de testes: contas e avisos em validação</span>
        {conta && <ContaNaFaixa email={conta.email} />}
      </div>
      <div className="st-conteudo">{children}</div>
    </div>
  );
}
