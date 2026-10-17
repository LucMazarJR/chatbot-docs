import { contaDaRequisicao } from '@/lib/conta/sessao';
import { notificacoes } from '@/lib/db';
import { TIPOS } from '@/lib/notificacoes/tipos';

export const dynamic = 'force-dynamic';

/**
 * Os avisos da conta logada, dos mais recentes para os mais antigos.
 *
 * Aqui o detalhe vai completo: quem pede está logado e é o destinatário. É o
 * lugar onde o lembrete que chegou discreto na tela bloqueada é lido de verdade.
 */
export async function GET(requisicao: Request) {
  const conta = await contaDaRequisicao(requisicao);
  if (!conta) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  const lista = await (await notificacoes())
    .find(
      // Pendente ainda não chegou; mostrar seria anunciar um aviso futuro antes da hora.
      { usuarioId: conta._id, estado: { $nin: ['pendente', 'enviando', 'cancelada'] } },
      {
        projection: {
          tipo: 1,
          detalhe: 1,
          estado: 1,
          criadaEm: 1,
          enviadaEm: 1,
          recebidaEm: 1,
          exibidaEm: 1,
          abertaEm: 1,
        },
      },
    )
    .sort({ criadaEm: -1 })
    .limit(50)
    .toArray();

  return Response.json({
    avisos: lista.map((aviso) => ({
      id: aviso._id,
      tipo: aviso.tipo,
      rotulo: (TIPOS[aviso.tipo] ?? TIPOS.aviso).rotulo,
      detalhe: aviso.detalhe,
      estado: aviso.estado,
      criadaEm: aviso.criadaEm,
      enviadaEm: aviso.enviadaEm,
      recebida: Boolean(aviso.recebidaEm),
      exibida: Boolean(aviso.exibidaEm),
      aberta: Boolean(aviso.abertaEm),
    })),
  });
}
