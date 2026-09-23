import { randomUUID } from 'node:crypto';

import { notificacoes } from '@/lib/db';
import { contaDaRequisicao, origemConfiavel } from '@/lib/conta/sessao';
import { dentroDoLimite } from '@/lib/limite';
import { despachar } from '@/lib/notificacoes/despachante';
import type { Notificacao } from '@/lib/notificacoes/tipos';

export const dynamic = 'force-dynamic';

/**
 * Manda um aviso de teste para os aparelhos da própria conta, na hora.
 *
 * Passa pela mesma fila e pelo mesmo despachante de um aviso de verdade — um
 * atalho que enviasse direto provaria que o atalho funciona, e não o caminho que
 * a equipe vai usar.
 *
 * Dispara a rodada em vez de esperar o relógio: quem tocou em "enviar teste" está
 * com o celular na mão, e 30 segundos parecem defeito.
 */
export async function POST(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const conta = await contaDaRequisicao(requisicao);
  if (!conta) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  if (!(await dentroDoLimite(`notificacoes:teste:${conta._id}`, { janelaMs: 10 * 60 * 1000, maximo: 10 }))) {
    return Response.json({ erro: 'Muitos testes seguidos. Aguarde alguns minutos.' }, { status: 429 });
  }

  const agora = new Date();
  const aviso: Notificacao = {
    _id: randomUUID(),
    loteId: null,
    usuarioId: conta._id,
    tipo: 'teste',
    detalhe: 'Este é um aviso de teste. Se ele apareceu na tela, os avisos funcionam neste aparelho.',
    mostrarDetalhe: false,
    enviarEm: agora,
    validaAte: new Date(agora.getTime() + 15 * 60 * 1000),
    estado: 'pendente',
    tentativas: 0,
    travadaAte: null,
    recibo: null,
    entregas: [],
    motivo: null,
    criadaEm: agora,
    criadaPor: 'teste da própria pessoa',
    enviadaEm: null,
    recebidaEm: null,
    exibidaEm: null,
    abertaEm: null,
    expiraEm: null,
  };

  const col = await notificacoes();
  await col.insertOne(aviso);

  // Se o relógio estava no meio de uma rodada, esta chamada devolve aquela — que
  // pode ter começado antes de o aviso existir. Uma segunda rodada o pega.
  await despachar();
  let atual = await col.findOne({ _id: aviso._id });
  if (atual?.estado === 'pendente') {
    await despachar();
    atual = await col.findOne({ _id: aviso._id });
  }

  return Response.json({
    id: aviso._id,
    estado: atual?.estado ?? 'pendente',
    motivo: atual?.motivo ?? null,
    aparelhos: (atual?.entregas ?? []).map((entrega) => ({
      resultado: entrega.resultado,
      codigo: entrega.codigo,
    })),
  });
}
