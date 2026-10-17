import { randomUUID } from 'node:crypto';

import { MongoServerError } from 'mongodb';

import { usuarios } from '@/lib/db';
import { emailValido, normalizarEmail } from '@/lib/conta/email';
import { gerarHashDeSenha, SENHA_MAX, SENHA_MIN } from '@/lib/conta/senha';
import {
  abrirSessaoDeConta,
  contaPublica,
  cookieDeSessao,
  origemConfiavel,
} from '@/lib/conta/sessao';
import type { Usuario } from '@/lib/conta/tipos';
import { dentroDoLimite, identificar } from '@/lib/limite';

export const dynamic = 'force-dynamic';

/**
 * Mensagem única para e-mail já cadastrado.
 *
 * Não diz "este e-mail já tem conta". Num assistente de saúde, confirmar que um
 * endereço tem conta já revela algo sobre a pessoa, e sem envio de e-mail não
 * há como fazer isso do jeito certo (avisar o dono do endereço, e não quem
 * digitou).
 */
const JA_EXISTE = 'Não foi possível criar a conta com esse e-mail. Se você já tem conta, entre por ela.';

export async function POST(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  // Cadastro custa um scrypt de 32 MB: sem teto, é o jeito mais barato de
  // ocupar a CPU do servidor.
  if (!(await dentroDoLimite(`conta:cadastro:${identificar(requisicao)}`, { janelaMs: 60 * 60 * 1000, maximo: 10 }))) {
    return Response.json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
  }

  const corpo = (await requisicao.json().catch(() => ({}))) as {
    email?: string;
    senha?: string;
    nome?: string;
    aceite?: boolean;
  };

  const email = String(corpo.email ?? '').trim();
  const senha = String(corpo.senha ?? '');
  const nome = String(corpo.nome ?? '').trim().slice(0, 60) || null;

  if (!emailValido(email)) {
    return Response.json({ erro: 'Confira o e-mail digitado.' }, { status: 400 });
  }
  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
    return Response.json({ erro: `A senha precisa ter ao menos ${SENHA_MIN} caracteres.` }, { status: 400 });
  }
  // O aceite é condição, não enfeite: é a base legal para guardar as conversas
  // da conta. Sem ele a conta não nasce.
  if (corpo.aceite !== true) {
    return Response.json({ erro: 'Para criar a conta é preciso aceitar os termos.' }, { status: 400 });
  }

  const col = await usuarios();
  const emailNormalizado = normalizarEmail(email);

  // Antes do hash: não gastar um scrypt com um e-mail que vai ser recusado.
  if (await col.findOne({ emailNormalizado }, { projection: { _id: 1 } })) {
    return Response.json({ erro: JA_EXISTE }, { status: 409 });
  }

  const agora = new Date();
  const usuario: Usuario = {
    _id: randomUUID(),
    email,
    emailNormalizado,
    emailVerificado: false,
    senhaHash: await gerarHashDeSenha(senha),
    googleSub: null,
    nome,
    consentimentoEm: agora,
    criadoEm: agora,
  };

  try {
    await col.insertOne(usuario);
  } catch (erro) {
    // Dois cadastros simultâneos com o mesmo e-mail: a checagem acima é uma
    // corrida, e quem desempata é o índice único.
    if (erro instanceof MongoServerError && erro.code === 11000) {
      return Response.json({ erro: JA_EXISTE }, { status: 409 });
    }
    throw erro;
  }

  const token = await abrirSessaoDeConta(usuario._id, requisicao);

  return Response.json(
    { conta: contaPublica(usuario) },
    { status: 201, headers: { 'Set-Cookie': cookieDeSessao(token, requisicao) } },
  );
}
