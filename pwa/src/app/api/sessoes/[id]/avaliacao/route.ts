import { sessoes } from '@/lib/db';

export const dynamic = 'force-dynamic';

const LIMITE_COMENTARIO = 2000;

type Contexto = { params: Promise<{ id: string }> };

export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

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

function inteiroNoIntervalo(valor: unknown, minimo: number, maximo: number): number | null {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) return null;
  return numero;
}
