import { inscricoesPush } from '@/lib/db';
import { contaDaRequisicao, origemConfiavel } from '@/lib/conta/sessao';
import { idDaInscricao, validarInscricao } from '@/lib/push/inscricao';

export const dynamic = 'force-dynamic';

/**
 * Ativa os avisos neste aparelho, para a conta logada.
 *
 * Se o mesmo navegador já estava inscrito em outra conta, a inscrição passa
 * para esta. Um aparelho recebe os avisos de quem está logado nele agora — do
 * contrário, quem trocou de conta num computador compartilhado continuaria
 * recebendo os lembretes de saúde da pessoa anterior.
 */
export async function POST(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const conta = await contaDaRequisicao(requisicao);
  if (!conta) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  const inscricao = validarInscricao(await requisicao.json().catch(() => null));
  if (!inscricao) return Response.json({ erro: 'inscrição inválida' }, { status: 400 });

  const agora = new Date();
  await (await inscricoesPush()).updateOne(
    { _id: idDaInscricao(inscricao.endpoint) },
    {
      $set: {
        usuarioId: conta._id,
        endpoint: inscricao.endpoint,
        chaves: inscricao.chaves,
        userAgent: (requisicao.headers.get('user-agent') ?? '').slice(0, 300),
        atualizadaEm: agora,
        falhasSeguidas: 0,
      },
      $setOnInsert: { criadaEm: agora, ultimoSucessoEm: null },
    },
    { upsert: true },
  );

  return Response.json({ ok: true }, { status: 201 });
}

/** Desativa os avisos neste aparelho. */
export async function DELETE(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const conta = await contaDaRequisicao(requisicao);
  if (!conta) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  const corpo = (await requisicao.json().catch(() => ({}))) as { endpoint?: string };
  if (typeof corpo.endpoint !== 'string') {
    return Response.json({ erro: 'endpoint ausente' }, { status: 400 });
  }

  // Só a da própria conta: sem o filtro de usuarioId, quem soubesse o endpoint
  // de outro aparelho desligaria os avisos dele.
  await (await inscricoesPush()).deleteOne({
    _id: idDaInscricao(corpo.endpoint),
    usuarioId: conta._id,
  });

  return Response.json({ ok: true });
}
