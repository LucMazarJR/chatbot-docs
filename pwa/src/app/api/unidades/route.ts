import type { ObjectId } from 'mongodb';

import { bancoDeFaqs } from '@/lib/db';
import type { Unidade } from '@/lib/unidades';

export const dynamic = 'force-dynamic';

/**
 * A lista de unidades de saúde que o chat oferece na pergunta "em qual unidade
 * você está?".
 *
 * É a mesma lista que a equipe mantém no painel, em Unidades de saúde: uma
 * unidade criada ou renomeada lá aparece aqui na próxima abertura do chat. Só
 * nomes públicos, nenhum dado de quem conversa. O cache curto poupa o banco
 * quando um grupo inteiro abre o chat ao mesmo tempo num teste presencial.
 */
export async function GET() {
  try {
    const lista = await (await bancoDeFaqs())
      .collection<{ _id: ObjectId; nome: string }>('ubs_unidades')
      .find({}, { projection: { nome: 1 } })
      .sort({ nome: 1 })
      .toArray();
    const unidades: Unidade[] = lista.map((u) => ({ id: String(u._id), nome: u.nome }));
    return Response.json(
      { unidades },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch {
    // Sem a lista, o chat volta ao campo livre: a pergunta continua funcionando.
    return Response.json({ unidades: [] }, { status: 503 });
  }
}
