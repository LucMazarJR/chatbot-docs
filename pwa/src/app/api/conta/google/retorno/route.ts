import { randomUUID } from 'node:crypto';

import { MongoServerError } from 'mongodb';

import { usuarios } from '@/lib/db';
import {
  CAMINHO_DO_RETORNO,
  conferirIdToken,
  cookieQueEncerraOFluxo,
  lerCargaDoJwt,
  lerFluxo,
  origemPublica,
  URL_DO_TOKEN,
} from '@/lib/conta/google';
import { googleConfigurado } from '@/lib/conta/servidor';
import { abrirSessaoDeConta, cookieDeSessao, encerrarTodasAsSessoes } from '@/lib/conta/sessao';
import type { Usuario } from '@/lib/conta/tipos';
import { decidirVinculo } from '@/lib/conta/vinculo';
import { dentroDoLimite, identificar } from '@/lib/limite';

export const dynamic = 'force-dynamic';

/** O que a tela de entrar sabe explicar, em `?google=`. */
type Motivo =
  | 'indisponivel'
  | 'muitas-tentativas'
  | 'cancelado'
  | 'expirado'
  | 'erro'
  | 'email-nao-verificado'
  | 'sem-conta'
  | 'conflito';

/**
 * Volta do Google: troca o código, confere quem é e abre a sessão.
 *
 * Todo desfecho termina num redirecionamento, e nunca numa página de erro crua:
 * quem está no celular precisa voltar para a tela de entrar com uma frase que
 * diga o que fazer. O detalhe técnico vai só para o log, sem e-mail.
 */
export async function GET(requisicao: Request) {
  const origem = origemPublica(requisicao);
  const https = origem.startsWith('https:');

  const redirecionar = (destino: string, cookies: string[] = []) => {
    const cabecalhos = new Headers({ Location: destino, 'Cache-Control': 'no-store' });
    // O cookie do fluxo morre em qualquer desfecho: o `state` só vale uma vez.
    for (const cookie of [...cookies, cookieQueEncerraOFluxo(https)]) cabecalhos.append('Set-Cookie', cookie);
    return new Response(null, { status: 303, headers: cabecalhos });
  };
  const falhar = (motivo: Motivo, detalhe?: string) => {
    if (detalhe) console.warn(`[conta/google] ${motivo}: ${detalhe}`);
    return redirecionar(`/staging/entrar?google=${motivo}`);
  };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!googleConfigurado() || !clientId || !clientSecret) return falhar('indisponivel');

  if (!(await dentroDoLimite(`conta:google:${identificar(requisicao)}`, { janelaMs: 15 * 60 * 1000, maximo: 30 }))) {
    return falhar('muitas-tentativas');
  }

  const parametros = new URL(requisicao.url).searchParams;
  if (parametros.get('error')) return falhar('cancelado');

  const fluxo = lerFluxo(requisicao.headers.get('cookie'));
  const codigo = parametros.get('code');
  // Sem o cookie, ou com outro `state`: o login demorou mais de 10 minutos, foi
  // aberto noutra aba, ou alguém tenta fazer esta conta entrar numa conta dele.
  if (!fluxo || !codigo || parametros.get('state') !== fluxo.state) {
    return falhar('expirado', fluxo ? 'state diferente' : 'sem cookie do fluxo');
  }

  let idToken: string;
  try {
    const resposta = await fetch(URL_DO_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origem}${CAMINHO_DO_RETORNO}`,
        grant_type: 'authorization_code',
        code_verifier: fluxo.verificador,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const dados = (await resposta.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!resposta.ok || !dados.id_token) {
      return falhar('erro', `troca do código respondeu ${resposta.status} ${dados.error ?? ''}`.trim());
    }
    idToken = dados.id_token;
  } catch (erro) {
    return falhar('erro', `troca do código não respondeu: ${(erro as Error).message}`);
  }

  const conferido = conferirIdToken(lerCargaDoJwt(idToken), { clientId, nonce: fluxo.nonce, agora: new Date() });
  if (!conferido.ok) {
    return conferido.motivo === 'e-mail não verificado no Google'
      ? falhar('email-nao-verificado')
      : falhar('erro', conferido.motivo);
  }
  const { perfil } = conferido;

  const col = await usuarios();
  const [porSub, porEmail] = await Promise.all([
    col.findOne({ googleSub: perfil.sub }),
    col.findOne({ emailNormalizado: perfil.email }),
  ]);

  const decisao = decidirVinculo(porSub, porEmail, perfil, fluxo.aceite);
  let usuarioId: string;

  switch (decisao.acao) {
    case 'entrar':
      usuarioId = decisao.usuario._id;
      break;

    case 'vincular': {
      // O filtro pelo `googleSub` vazio desempata dois logins simultâneos com
      // Googles diferentes para o mesmo e-mail: só o primeiro vincula.
      const resultado = await col.updateOne(
        { _id: decisao.usuario._id, googleSub: null },
        {
          $set: {
            googleSub: perfil.sub,
            emailVerificado: true,
            ...(decisao.revogarSenha ? { senhaHash: null } : {}),
          },
        },
      );
      if (resultado.modifiedCount === 0) return falhar('erro', 'vínculo perdeu a corrida');
      // Quem entrou pela senha antes do vínculo pode não ser o dono do e-mail.
      if (decisao.revogarSenha) await encerrarTodasAsSessoes(decisao.usuario._id);
      usuarioId = decisao.usuario._id;
      break;
    }

    case 'criar': {
      const agora = new Date();
      const usuario: Usuario = {
        _id: randomUUID(),
        email: perfil.email,
        emailNormalizado: perfil.email,
        emailVerificado: true,
        senhaHash: null,
        googleSub: perfil.sub,
        nome: perfil.nome,
        // O aceite foi marcado na tela antes de ir ao Google; é ele que
        // autoriza esta conta a existir.
        consentimentoEm: agora,
        criadoEm: agora,
      };
      try {
        await col.insertOne(usuario);
      } catch (erro) {
        if (erro instanceof MongoServerError && erro.code === 11000) {
          return falhar('erro', 'conta criada ao mesmo tempo por outro login');
        }
        throw erro;
      }
      usuarioId = usuario._id;
      break;
    }

    case 'pedir-aceite':
      return falhar('sem-conta');

    case 'conflito':
      return falhar('conflito');
  }

  const token = await abrirSessaoDeConta(usuarioId, requisicao);
  return redirecionar('/staging', [cookieDeSessao(token, requisicao)]);
}
