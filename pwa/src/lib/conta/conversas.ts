import { mensagens, sessoes } from '@/lib/db';
import type { Mensagem, Sessao } from '@/lib/tipos';

export type ConversaResumida = {
  id: string;
  iniciadaEm: string;
  encerrada: boolean;
  perguntas: number;
  /** A primeira pergunta, cortada — é como a pessoa reconhece a conversa na lista. */
  primeiraPergunta: string | null;
};

/**
 * As conversas de uma conta, da mais recente para a mais antiga.
 *
 * As que ficaram vazias (a pessoa abriu e não perguntou nada) não entram: numa
 * lista de histórico elas são só ruído com data. Continuam no banco, e somem
 * pelo prazo de retenção como qualquer outra.
 */
export async function conversasDaConta(usuarioId: string): Promise<ConversaResumida[]> {
  const lista = await (await sessoes())
    .find({ usuarioId }, { projection: { _id: 1, iniciadaEm: 1, encerradaEm: 1 } })
    .sort({ iniciadaEm: -1 })
    .limit(100)
    .toArray();

  if (lista.length === 0) return [];

  const perguntas = await (await mensagens())
    .aggregate<{ _id: string; total: number; primeira: string }>([
      { $match: { sessaoId: { $in: lista.map((s) => s._id) }, papel: 'user' } },
      { $sort: { em: 1 } },
      { $group: { _id: '$sessaoId', total: { $sum: 1 }, primeira: { $first: '$texto' } } },
    ])
    .toArray();

  const porSessao = new Map(perguntas.map((p) => [p._id, p]));

  return lista
    .map((sessao) => {
      const dados = porSessao.get(sessao._id);
      const primeira = dados?.primeira ?? null;
      return {
        id: sessao._id,
        iniciadaEm: sessao.iniciadaEm.toISOString(),
        encerrada: Boolean(sessao.encerradaEm),
        perguntas: dados?.total ?? 0,
        primeiraPergunta: primeira && primeira.length > 90 ? `${primeira.slice(0, 90)}…` : primeira,
      };
    })
    .filter((conversa) => conversa.perguntas > 0);
}

/**
 * Uma conversa, se for desta conta.
 *
 * Devolve nulo tanto para "não existe" quanto para "é de outra pessoa" — a
 * página responde igual nos dois casos, e ninguém descobre ids alheios por
 * tentativa.
 */
export async function conversaDaConta(
  usuarioId: string,
  sessaoId: string,
): Promise<{ sessao: Sessao; mensagens: Mensagem[] } | null> {
  const sessao = await (await sessoes()).findOne({ _id: sessaoId, usuarioId });
  if (!sessao) return null;

  const lista = await (await mensagens())
    .find({ sessaoId, pendente: { $ne: true } })
    .sort({ em: 1 })
    .toArray();

  return { sessao, mensagens: lista };
}
