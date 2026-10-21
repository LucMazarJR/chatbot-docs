import { origemConfiavel } from '@/lib/conta/sessao';
import { mensagens } from '@/lib/db';
import { dentroDoLimite } from '@/lib/limite';
import { autenticarSessao } from '@/lib/sessao-autenticada';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

const NAO_ENCONTRADA = () => Response.json({ erro: 'mensagem não encontrada' }, { status: 404 });

/**
 * A resposta tocou na voz do celular.
 *
 * A voz natural já se registra ao ser gerada (`vozGerada`); a do celular toca
 * no aparelho e não passava pelo servidor. Sem este registro, o painel não
 * teria como comparar quanto cada voz é usada, que é o que decide se a natural
 * vale o custo. Grava só a hora: o texto já está na mensagem.
 */
export async function POST(requisicao: Request, { params }: Contexto) {
  // No staging, quem prova ser dono é o cookie da conta, e cookie vai junto
  // até em pedido de outro site: a origem precisa ser a do próprio app.
  if (!origemConfiavel(requisicao)) return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  const { id } = await params;
  const colecao = await mensagens();
  const mensagem = await colecao.findOne({ _id: id }, { projection: { sessaoId: 1, papel: 1 } });
  if (!mensagem || mensagem.papel !== 'bot') return NAO_ENCONTRADA();

  const autenticada = await autenticarSessao(requisicao, mensagem.sessaoId);
  if ('erro' in autenticada) return NAO_ENCONTRADA();

  // Medição, e não ação: passando do limite, só deixa de registrar.
  if (!(await dentroDoLimite(`voz:ouvida:${mensagem.sessaoId}`, { janelaMs: 10 * 60 * 1000, maximo: 60 }))) {
    return Response.json({ ok: false }, { status: 429 });
  }

  await colecao.updateOne({ _id: id }, { $set: { ouvidaNoCelularEm: new Date() } });
  return Response.json({ ok: true });
}
