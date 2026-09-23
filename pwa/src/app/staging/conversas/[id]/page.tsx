import { notFound, redirect } from 'next/navigation';

import { Balao } from '@/components/Balao';
import { conversaDaConta } from '@/lib/conta/conversas';
import { contaAtual } from '@/lib/conta/servidor';
import { dataPorExtenso, hora } from '@/lib/datas';

export const dynamic = 'force-dynamic';

/**
 * Uma conversa anterior, só para leitura.
 *
 * O chat abre sempre a conversa aberta da conta; as encerradas só se leem por
 * aqui. Sem polegar e sem campo de mensagem de propósito: a avaliação daquela
 * conversa já foi dada, e perguntar de novo é na conversa atual.
 */
export default async function ConversaAnterior({ params }: { params: Promise<{ id: string }> }) {
  const conta = await contaAtual();
  if (!conta) redirect('/staging/entrar');

  const { id } = await params;
  const conversa = await conversaDaConta(conta._id, id);
  if (!conversa) notFound();

  const data = dataPorExtenso(conversa.sessao.iniciadaEm);

  return (
    <div className="st-transcricao">
      <header className="st-transcricao-topo">
        <a href="/staging/conta" aria-label="Voltar para a conta">
          ←
        </a>
        <div>
          <strong>Conversa de {data}</strong>
          <span>{conversa.sessao.encerradaEm ? 'encerrada' : 'em andamento'}</span>
        </div>
      </header>

      <main className="mensagens" aria-label={`Conversa de ${data}`}>
        {conversa.mensagens.map((mensagem, indice) => (
          <Balao
            key={mensagem._id}
            papel={mensagem.papel}
            texto={mensagem.texto}
            hora={hora(mensagem.em)}
            lida={mensagem.papel === 'user'}
            primeira={indice === 0 || conversa.mensagens[indice - 1].papel !== mensagem.papel}
          />
        ))}
      </main>
    </div>
  );
}
