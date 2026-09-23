import { randomUUID } from 'node:crypto';

import { sessoes } from '@/lib/db';
import { contaDaRequisicao, origemConfiavel } from '@/lib/conta/sessao';
import { gerarChaveDeSessao } from '@/lib/sessao-autenticada';
import type { Sessao, Versao } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const LIMITE_NOME = 60;

export async function POST(requisicao: Request) {
  const corpo = (await requisicao.json().catch(() => ({}))) as {
    nome?: string;
    versao?: string;
    comConta?: boolean;
  };

  // LÓGICA DO LUCIANO: a conversa só é da conta quando a tela PEDE, com
  // `comConta: true`. O cookie da conta vale para o site inteiro, então ele
  // também chega aqui quando a pessoa logada abre o `/`, e deduzir a conta
  // pelo cookie mudaria o chat anônimo para quem tem conta, que é exatamente o
  // que não pode acontecer com o teste de campo.
  if (corpo.comConta === true) return abrirDaConta(requisicao);

  const nome = String(corpo.nome ?? '').trim().slice(0, LIMITE_NOME);
  // Quem não informa cai em 'a'. Vale para chamadas antigas e para o curl de
  // diagnóstico, que não têm interface nenhuma.
  const versao: Versao = corpo.versao === 'b' ? 'b' : 'a';

  const col = await sessoes();

  // Sem tela de entrada, ninguem informa um nome. Numerar por ordem de chegada
  // e o que mantem a lista da revisao legivel: "Participante 7" da para citar
  // numa conversa, um UUID nao.
  const rotulo = nome || `Participante ${(await col.countDocuments({})) + 1}`;

  const sessao: Sessao = {
    _id: randomUUID(),
    chave: gerarChaveDeSessao(),
    nome: rotulo,
    versao,
    iniciadaEm: new Date(),
    encerradaEm: null,
    userAgent: (requisicao.headers.get('user-agent') ?? '').slice(0, 300),
    avaliacao: null,
  };

  await col.insertOne(sessao);

  // A chave sai daqui UMA vez. Não há rota que a devolva depois: quem a perde
  // perde o acesso à conversa, que é exatamente o comportamento desejado.
  return Response.json(
    { sessaoId: sessao._id, chave: sessao.chave, nome: sessao.nome },
    { status: 201 },
  );
}

/**
 * A conversa aberta da conta, ou uma nova.
 *
 * Devolve a que já existe em vez de sempre criar: é o que faz a mesma conversa
 * aparecer no celular e no computador. Só nasce outra depois que esta for
 * encerrada com a avaliação.
 *
 * Sessão de conta não tem chave: quem autentica é o cookie. E o nome segue a
 * numeração de sempre, e NÃO o e-mail: o painel de conversas é lido por quem
 * analisa respostas, e essa pessoa não precisa saber de quem é o relato.
 */
async function abrirDaConta(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const conta = await contaDaRequisicao(requisicao);
  if (!conta) return Response.json({ erro: 'não autenticado' }, { status: 401 });

  const col = await sessoes();

  const aberta = await col.findOne(
    { usuarioId: conta._id, encerradaEm: null },
    { sort: { iniciadaEm: -1 }, projection: { _id: 1 } },
  );
  if (aberta) return Response.json({ sessaoId: aberta._id, retomada: true });

  const sessao: Sessao = {
    _id: randomUUID(),
    nome: `Participante ${(await col.countDocuments({})) + 1}`,
    versao: 'a',
    iniciadaEm: new Date(),
    encerradaEm: null,
    userAgent: (requisicao.headers.get('user-agent') ?? '').slice(0, 300),
    avaliacao: null,
    // O aceite foi dado no cadastro da conta, com data própria. A conversa
    // herda essa data em vez de pedir de novo.
    consentimentoEm: conta.consentimentoEm,
    usuarioId: conta._id,
  };

  await col.insertOne(sessao);

  return Response.json({ sessaoId: sessao._id, retomada: false }, { status: 201 });
}
