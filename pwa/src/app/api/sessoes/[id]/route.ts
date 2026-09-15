import { apagarConversa } from '@/lib/apagar-conversa';
import { autenticarSessao } from '@/lib/sessao-autenticada';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/**
 * A pessoa apaga a própria conversa.
 *
 * É o direito de exclusão da LGPD (art. 18, VI) exercido sem precisar pedir a
 * ninguém: quem está com a conversa aberta no aparelho é quem pode apagá-la.
 *
 * SESSÃO ANTIGA, SEM CHAVE, NÃO APAGA POR AQUI. As sessões criadas antes da
 * chave abrem só com o id, por compatibilidade — e o id aparece no dashboard e
 * nos registros do n8n. Ler com o id era um risco pequeno e conhecido; apagar
 * com o id deixaria qualquer um que o tivesse destruir a conversa de outra
 * pessoa. Essas sessões são da primeira rodada de testes, já encerrada, e um
 * pedido sobre elas passa pela equipe, que apaga pelo dashboard.
 */
export async function DELETE(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;

  if (!autenticada.sessao.chave) {
    return Response.json({ erro: 'sessão não encontrada' }, { status: 404 });
  }

  try {
    const resultado = await apagarConversa(id);
    return Response.json({ ok: true, ...resultado });
  } catch (erro) {
    // Sem detalhe para a tela: o motivo serve à equipe. A conversa continua
    // inteira — as cópias saem primeiro — então tentar de novo é seguro.
    console.error(`[exclusão] falhou para a sessão ${id}:`, erro);
    return Response.json({ erro: 'não foi possível apagar agora' }, { status: 503 });
  }
}
