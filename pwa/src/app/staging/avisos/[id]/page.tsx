import { notFound, redirect } from 'next/navigation';

import { contaAtual } from '@/lib/conta/servidor';
import { notificacoes } from '@/lib/db';
import { TIPOS } from '@/lib/notificacoes/tipos';

export const dynamic = 'force-dynamic';

/**
 * Um aviso, por inteiro.
 *
 * É para cá que o toque na notificação leva. Na tela bloqueada o aviso chegou
 * discreto ("Você tem um lembrete"); aqui, com a conta logada, aparece o
 * detalhe. Aviso de outra conta e id inexistente dão o mesmo 404.
 */
export default async function Aviso({ params }: { params: Promise<{ id: string }> }) {
  const conta = await contaAtual();
  if (!conta) redirect('/staging/entrar');

  const { id } = await params;
  const aviso = await (await notificacoes()).findOne({
    _id: id,
    usuarioId: conta._id,
    estado: { $nin: ['pendente', 'enviando', 'cancelada'] },
  });
  if (!aviso) notFound();

  const quando = (aviso.enviadaEm ?? aviso.criadaEm).toLocaleString('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <main className="st-pagina">
      <p className="st-voltar">
        <a href="/staging/avisos">← Todos os avisos</a>
      </p>

      <article className="st-cartao">
        <p className="st-dica">{(TIPOS[aviso.tipo] ?? TIPOS.aviso).rotulo} · {quando}</p>
        <p className="st-detalhe-aviso">{aviso.detalhe}</p>
      </article>
    </main>
  );
}
