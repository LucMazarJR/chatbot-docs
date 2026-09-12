import { mensagens } from '@/lib/db';
import { autenticarPelaMensagem } from '@/lib/sessao-autenticada';

export const dynamic = 'force-dynamic';

/**
 * Depois de quanto tempo uma pendência é dada como perdida.
 *
 * Cobre o pior caso observado (perto de 3 minutos) com folga. Passado isso, o
 * n8n caiu, o retorno não chegou ou o fluxo travou — e continuar mostrando
 * "digitando" seria enganar quem espera.
 */
const MS_ATE_DESISTIR = 4 * 60 * 1000;

type Contexto = { params: Promise<{ id: string }> };

/**
 * Estado de uma resposta, consultado pela tela enquanto ela não chega.
 *
 * A expiração acontece na leitura, e não numa tarefa agendada: a pendência só
 * incomoda alguém no momento em que alguém pergunta por ela, então é aqui que
 * ela precisa ser resolvida. Uma rotina de limpeza seria mais uma peça para
 * manter viva sem nada em troca.
 */
export async function GET(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  // Esta rota entrega o TEXTO da resposta. Sem a conferência, seria a
  // transcrição servida por outra porta: bastaria o id da mensagem, que também
  // não é segredo — ele volta no corpo do POST e vai para o n8n.
  const autenticada = await autenticarPelaMensagem(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  const col = await mensagens();
  const mensagem = await col.findOne(
    { _id: id },
    { projection: { texto: 1, em: 1, pendente: 1, erro: 1 } },
  );

  if (!mensagem) return Response.json({ erro: 'mensagem não encontrada' }, { status: 404 });

  if (mensagem.pendente) {
    const esperando = Date.now() - new Date(mensagem.em).getTime();

    if (esperando < MS_ATE_DESISTIR) {
      return Response.json({ pendente: true, esperandoMs: esperando });
    }

    await col.updateOne(
      { _id: id, pendente: true },
      {
        $set: {
          pendente: false,
          erro: true,
          motivoErro: `sem retorno do n8n em ${Math.round(esperando / 1000)}s`,
          latenciaMs: esperando,
        },
      },
    );

    return Response.json({ pendente: false, erro: true, causa: 'demora' });
  }

  return Response.json({
    pendente: false,
    erro: Boolean(mensagem.erro),
    resposta: mensagem.texto,
    // O texto de erro que a tela mostra é escolhido por ela, a partir da causa.
    causa: mensagem.erro ? 'indisponivel' : null,
  });
}
