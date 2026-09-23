import { apagarConta } from '@/lib/conta/apagar-conta';
import {
  contaDaRequisicao,
  contaPublica,
  cookieQueEncerra,
  origemConfiavel,
} from '@/lib/conta/sessao';

export const dynamic = 'force-dynamic';

/** A conta logada neste aparelho. */
export async function GET(requisicao: Request) {
  const usuario = await contaDaRequisicao(requisicao);
  if (!usuario) return Response.json({ conta: null }, { status: 401 });

  return Response.json({ conta: contaPublica(usuario) });
}

/**
 * Apaga a conta, as conversas dela e as cópias que a curadoria guardou.
 *
 * É o direito de exclusão da LGPD para quem tem conta. A cascata inteira está
 * em `apagarConta`.
 */
export async function DELETE(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const usuario = await contaDaRequisicao(requisicao);
  if (!usuario) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  try {
    const resultado = await apagarConta(usuario._id);
    return Response.json(
      { ok: true, ...resultado },
      { headers: { 'Set-Cookie': cookieQueEncerra(requisicao) } },
    );
  } catch (erro) {
    // A conta sai por último: se chegou aqui, ela ainda existe e a pessoa
    // continua logada para tentar de novo.
    console.error(`[conta] exclusão falhou para ${usuario._id}: ${(erro as Error).message}`);
    return Response.json({ erro: 'Não foi possível apagar agora. Tente de novo.' }, { status: 503 });
  }
}
