import { notificacoes } from '@/lib/db';
import { idDaInscricao } from '@/lib/push/inscricao';

export const dynamic = 'force-dynamic';

/**
 * O aparelho avisa que mostrou, ou que alguém tocou no aviso.
 *
 * LÓGICA DO LUCIANO: é o que transforma "validar os limites do push" em número.
 * "Enviada" só quer dizer que o serviço do Google ou da Apple aceitou; se o
 * aviso apareceu na tela, só o aparelho sabe. Com os recibos, a taxa de
 * exibição e de abertura sai por plataforma, sem depender de ninguém lembrar de
 * contar.
 *
 * Quem chama é o service worker, e ele não prova identidade de conta. A prova é
 * o `recibo`, um segredo gerado no envio e que só viajou dentro do push
 * criptografado. Sem ele, qualquer um inflaria as taxas com ids adivinhados.
 */
export async function POST(requisicao: Request) {
  const corpo = (await requisicao.json().catch(() => ({}))) as {
    id?: string;
    recibo?: string;
    evento?: string;
    endpoint?: string;
  };

  const CAMPOS = { recebida: 'recebidaEm', exibida: 'exibidaEm', aberta: 'abertaEm' } as const;
  const campo = CAMPOS[corpo.evento as keyof typeof CAMPOS] ?? null;
  if (!campo || typeof corpo.id !== 'string' || typeof corpo.recibo !== 'string') {
    return Response.json({ erro: 'recibo inválido' }, { status: 400 });
  }

  const col = await notificacoes();
  const agora = new Date();

  // Só a primeira vez conta: o mesmo aviso aberto de novo não muda a taxa.
  const aviso = await col.updateOne(
    { _id: corpo.id, recibo: corpo.recibo, [campo]: null },
    { $set: { [campo]: agora } },
  );

  // Recibo errado e id inexistente respondem igual — nada a descobrir por aqui.
  if (aviso.matchedCount === 0) {
    const existe = await col.countDocuments({ _id: corpo.id, recibo: corpo.recibo }, { limit: 1 });
    if (existe === 0) return Response.json({ erro: 'recibo inválido' }, { status: 404 });
  }

  // Por aparelho também, quando o service worker soube dizer qual.
  if (typeof corpo.endpoint === 'string' && corpo.endpoint.length <= 2048) {
    await col.updateOne(
      { _id: corpo.id, recibo: corpo.recibo },
      { $set: { [`entregas.$[e].${campo}`]: agora } },
      { arrayFilters: [{ 'e.inscricaoId': idDaInscricao(corpo.endpoint), [`e.${campo}`]: null }] },
    );
  }

  return new Response(null, { status: 204 });
}
