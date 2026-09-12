import { mensagens } from '@/lib/db';
import { autenticarPelaMensagem } from '@/lib/sessao-autenticada';
import type { Voto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  // O 👍/👎 é o que calibra a qualidade das respostas. Voto de quem não estava
  // na conversa não é retorno, é ruído no dado que orienta a curadoria.
  const autenticada = await autenticarPelaMensagem(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  const corpo = (await requisicao.json().catch(() => ({}))) as {
    voto?: Voto | null;
    comentario?: string;
  };
  const voto = corpo.voto ?? null;

  if (voto !== 'up' && voto !== 'down' && voto !== null) {
    return Response.json({ erro: 'voto inválido' }, { status: 400 });
  }

  // A versão B abre um campo de texto junto do polegar. É o retorno mais rico
  // que o protótipo coleta — diz POR QUE a resposta falhou, não só que falhou.
  const comentario = String(corpo.comentario ?? '')
    .trim()
    .slice(0, 2000);

  const { matchedCount } = await (await mensagens()).updateOne(
    { _id: id, papel: 'bot' },
    {
      $set: {
        feedback: voto,
        feedbackComentario: comentario || null,
        feedbackEm: new Date(),
      },
    },
  );

  if (!matchedCount) return Response.json({ erro: 'mensagem não encontrada' }, { status: 404 });
  return Response.json({ ok: true });
}
