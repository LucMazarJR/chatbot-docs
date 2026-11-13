import { sessoes } from '@/lib/db';
import { autenticarSessao } from '@/lib/sessao-autenticada';
import { pareceNomeDeUbs } from '@/lib/ubs';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/**
 * Registra de qual UBS a pessoa está falando, ou que ela pulou a pergunta.
 *
 * Grava o texto como veio. Normalizar aqui fixaria para sempre o que a lista de
 * unidades sabia naquele dia: no painel, uma grafia corrigida vale também para
 * as conversas que já aconteceram.
 */
export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  const corpo = (await requisicao.json().catch(() => ({}))) as { texto?: unknown };
  const pulou = corpo.texto === null || corpo.texto === undefined;

  // A tela já filtra, mas a rota é pública: sem isto, qualquer chamada direta
  // gravaria texto livre num campo que a equipe lê como nome de unidade.
  if (!pulou && (typeof corpo.texto !== 'string' || !pareceNomeDeUbs(corpo.texto))) {
    return Response.json({ erro: 'nome de UBS inválido' }, { status: 400 });
  }

  await (await sessoes()).updateOne(
    { _id: id },
    { $set: { ubs: { texto: pulou ? null : (corpo.texto as string).trim(), em: new Date() } } },
  );
  return Response.json({ ok: true });
}
