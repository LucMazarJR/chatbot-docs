import { sessoes } from '@/lib/db';
import { autenticarSessao } from '@/lib/sessao-autenticada';

export const dynamic = 'force-dynamic';

const LIMITE_COMENTARIO = 2000;

type Contexto = { params: Promise<{ id: string }> };

export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  // Sem isto, quem tivesse o id podia encerrar a conversa de outra pessoa e
  // ainda deixar uma nota no lugar dela — a avaliação é o dado que sustenta a
  // conclusão do protótipo inteiro.
  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  const corpo = (await requisicao.json().catch(() => ({}))) as {
    estrelas?: number;
    nps?: number;
    comentario?: string;
  };

  const estrelas = inteiroNoIntervalo(corpo.estrelas, 1, 5);
  const nps = inteiroNoIntervalo(corpo.nps, 0, 10);
  const comentario = String(corpo.comentario ?? '').trim().slice(0, LIMITE_COMENTARIO);

  // Estrelas, NPS e comentário são opcionais separadamente: quem quer só fechar
  // a conversa sem responder nada não deve ficar preso a um formulário.
  const { matchedCount } = await (await sessoes()).updateOne(
    { _id: id },
    {
      $set: {
        avaliacao: { estrelas, nps, comentario: comentario || null, avaliadaEm: new Date() },
        encerradaEm: new Date(),
      },
    },
  );

  if (!matchedCount) return Response.json({ erro: 'sessão não encontrada' }, { status: 404 });
  return Response.json({ ok: true });
}

/**
 * Converte para inteiro dentro do intervalo, ou `null`.
 *
 * A checagem de ausência vem ANTES da conversão, e não é decoração:
 * `Number(null)` é `0`, e `Number('')` também. Sem esta guarda, um campo não
 * respondido virava a nota 0 — que no NPS é o pior detrator possível. A versão
 * B não pergunta NPS e mandava `null` em toda avaliação, então cada conversa
 * dela entrava na média como um zero. O número saía errado sem nenhum erro à
 * vista.
 */
function inteiroNoIntervalo(valor: unknown, minimo: number, maximo: number): number | null {
  if (valor === null || valor === undefined || valor === '') return null;

  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) return null;
  return numero;
}
