import { ObjectId } from 'mongodb';

import { bancoDeFaqs, sessoes } from '@/lib/db';
import { autenticarSessao } from '@/lib/sessao-autenticada';
import { pareceNomeDeUbs } from '@/lib/ubs';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/**
 * Registra de qual unidade de saúde a pessoa está falando, ou que ela pulou.
 *
 * Com `unidadeId`, a pessoa tocou numa unidade da lista: grava o id e o nome
 * como está no banco, e não o que veio da tela. Sem id, grava o texto como
 * veio. Normalizar aqui fixaria para sempre o que a lista sabia naquele dia:
 * no painel, uma grafia corrigida vale também para as conversas que já
 * aconteceram.
 */
export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  const corpo = (await requisicao.json().catch(() => ({}))) as { texto?: unknown; unidadeId?: unknown };

  if (corpo.unidadeId !== undefined && corpo.unidadeId !== null) {
    const unidade =
      typeof corpo.unidadeId === 'string' && ObjectId.isValid(corpo.unidadeId)
        ? await (await bancoDeFaqs())
            .collection<{ _id: ObjectId; nome: string }>('ubs_unidades')
            .findOne({ _id: new ObjectId(corpo.unidadeId) }, { projection: { nome: 1 } })
        : null;
    // A unidade pode ter sido removida da lista entre abrir o chat e tocar nela.
    if (!unidade) {
      return Response.json(
        { erro: 'Essa unidade não está mais na lista. Recarregue a página e escolha de novo.' },
        { status: 400 },
      );
    }
    await (await sessoes()).updateOne(
      { _id: id },
      { $set: { ubs: { texto: unidade.nome, unidadeId: String(unidade._id), em: new Date() } } },
    );
    return Response.json({ ok: true });
  }

  const pulou = corpo.texto === null || corpo.texto === undefined;

  // A tela já filtra, mas a rota é pública: sem isto, qualquer chamada direta
  // gravaria texto livre num campo que a equipe lê como nome de unidade.
  if (!pulou && (typeof corpo.texto !== 'string' || !pareceNomeDeUbs(corpo.texto))) {
    return Response.json({ erro: 'Isso não parece o nome de uma unidade de saúde.' }, { status: 400 });
  }

  await (await sessoes()).updateOne(
    { _id: id },
    { $set: { ubs: { texto: pulou ? null : (corpo.texto as string).trim(), em: new Date() } } },
  );
  return Response.json({ ok: true });
}
