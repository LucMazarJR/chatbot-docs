import { sessoes } from '@/lib/db';
import { autenticarSessao } from '@/lib/sessao-autenticada';
import { ESCOLHAS_DO_TUTORIAL, type EscolhaDoTutorial } from '@/lib/tutorial';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/**
 * Registra o que a pessoa fez com o tutorial: viu até o fim, pulou, recusou
 * ou ignorou e perguntou direto.
 *
 * É o dado que diz se o tutorial serve para alguém. Sem ele, o staging não
 * teria como responder se vale levar o tutorial para o `/`.
 */
export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  const corpo = (await requisicao.json().catch(() => ({}))) as { escolha?: string };
  if (!ESCOLHAS_DO_TUTORIAL.includes(corpo.escolha as EscolhaDoTutorial)) {
    return Response.json({ erro: 'escolha inválida' }, { status: 400 });
  }

  await (await sessoes()).updateOne(
    { _id: id },
    { $set: { tutorial: { escolha: corpo.escolha as EscolhaDoTutorial, em: new Date() } } },
  );
  return Response.json({ ok: true });
}
