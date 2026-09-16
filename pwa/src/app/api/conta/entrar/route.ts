import { usuarios } from '@/lib/db';
import { normalizarEmail } from '@/lib/conta/email';
import { conferirSenha, SENHA_MAX } from '@/lib/conta/senha';
import {
  abrirSessaoDeConta,
  contaPublica,
  cookieDeSessao,
  origemConfiavel,
} from '@/lib/conta/sessao';
import { dentroDoLimite, identificar } from '@/lib/limite';

export const dynamic = 'force-dynamic';

/**
 * Uma mensagem só para todo erro de login.
 *
 * "E-mail não encontrado" e "senha errada" separados dizem a qualquer um quais
 * endereços têm conta. A mesma razão faz o scrypt rodar mesmo quando o e-mail
 * não existe (ver `conferirSenha`): a resposta não pode chegar mais rápido.
 */
const FALHOU = 'E-mail ou senha incorretos.';

export async function POST(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const corpo = (await requisicao.json().catch(() => ({}))) as { email?: string; senha?: string };
  const emailNormalizado = normalizarEmail(String(corpo.email ?? ''));
  const senha = String(corpo.senha ?? '').slice(0, SENHA_MAX);

  // Dois limites, porque cada um fecha uma porta. Por IP segura quem testa
  // muitos e-mails de um lugar só; por e-mail segura quem insiste numa conta
  // específica trocando de IP.
  const janela = { janelaMs: 15 * 60 * 1000 };
  const porIp = await dentroDoLimite(`conta:entrar:ip:${identificar(requisicao)}`, { ...janela, maximo: 30 });
  const porEmail = await dentroDoLimite(`conta:entrar:email:${emailNormalizado}`, { ...janela, maximo: 10 });
  if (!porIp || !porEmail) {
    return Response.json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
  }

  const usuario = emailNormalizado
    ? await (await usuarios()).findOne({ emailNormalizado })
    : null;

  const senhaConfere = await conferirSenha(senha, usuario?.senhaHash ?? null);
  if (!usuario || !senhaConfere) {
    return Response.json({ erro: FALHOU }, { status: 401 });
  }

  const token = await abrirSessaoDeConta(usuario._id, requisicao);

  return Response.json(
    { conta: contaPublica(usuario) },
    { headers: { 'Set-Cookie': cookieDeSessao(token, requisicao) } },
  );
}
