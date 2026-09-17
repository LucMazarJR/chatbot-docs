import { redirect } from 'next/navigation';

import { FormularioEntrar } from '@/components/conta/FormularioEntrar';
import { contaAtual, googleConfigurado } from '@/lib/conta/servidor';

export const dynamic = 'force-dynamic';

/**
 * O que aconteceu na volta do Google, dito para quem está com o celular na mão.
 *
 * Cada frase diz o que fazer em seguida — "erro no login" sozinho deixa a
 * pessoa tentando a mesma coisa de novo.
 */
const VOLTA_DO_GOOGLE: Record<string, string> = {
  cancelado: 'O login com Google foi cancelado.',
  'sem-conta':
    'Ainda não existe conta com esse Google. Para criar, marque o aceite dos termos abaixo e toque em Entrar com Google de novo.',
  conflito:
    'Este e-mail já está ligado a outra conta do Google. Entre com a conta do Google usada da primeira vez.',
  'email-nao-verificado':
    'O Google ainda não confirmou este e-mail. Confirme o e-mail na sua conta do Google ou crie a conta com e-mail e senha.',
  expirado: 'O login demorou demais ou foi aberto em outra aba. Tente de novo.',
  'muitas-tentativas': 'Muitas tentativas seguidas. Aguarde alguns minutos.',
  indisponivel: 'O login com Google não está disponível agora. Use e-mail e senha.',
  erro: 'Não foi possível entrar com o Google agora. Tente de novo ou use e-mail e senha.',
};

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ apagada?: string; google?: string }>;
}) {
  if (await contaAtual()) redirect('/staging');

  const { apagada, google } = await searchParams;
  const voltaDoGoogle = google ? (VOLTA_DO_GOOGLE[google] ?? VOLTA_DO_GOOGLE.erro) : null;

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

      {voltaDoGoogle && (
        <p className="st-erro" role="alert">
          {voltaDoGoogle}
        </p>
      )}

      <FormularioEntrar
        googleAtivo={googleConfigurado()}
        modoInicial={google === 'sem-conta' ? 'criar' : 'entrar'}
      />
    </main>
  );
}
