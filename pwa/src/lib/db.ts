import { MongoClient, MongoServerError, type Collection, type Db } from 'mongodb';

import type { SessaoDeConta, Usuario } from './conta/tipos';
import type { RegistroDeLimite } from './limite';
import type { Contador } from './participante';
import type { Notificacao } from './notificacoes/tipos';
import type { InscricaoPush } from './push/tipos';
import type { Mensagem, Sessao } from './tipos';

/** Configuração guardada no banco, como as chaves VAPID. */
type Configuracao = { _id: string; publica: string; privada: string; criadaEm: Date };

/**
 * Persistência do protótipo.
 *
 * Vive num banco PRÓPRIO (`PWA_MONGO_DB`, por padrão `pwa_prototipo`), separado
 * de `ministerio_saude`. Duas razões:
 *
 * 1. As FAQs são conteúdo curado e a base do chatbot em produção. Conversa de
 *    participante é dado de validação, descartável. Misturar as duas coisas na
 *    mesma base convida a um `drop` errado.
 * 2. Ao fim da validação, apagar tudo é `db.dropDatabase()` num banco que só
 *    tem isso dentro, sem risco de levar FAQ junto.
 *
 * O banco é escolhido EXPLICITAMENTE por nome, e não pelo caminho da
 * `MONGODB_URI`. Essa é a armadilha nº 1 do projeto (ver docs/armadilhas.md):
 * uma URI sem nome de banco faz o driver assumir `test` em silêncio, sem erro
 * nenhum.
 */

const NOME_BANCO_PADRAO = 'pwa_prototipo';

/**
 * O banco das FAQs, onde a curadoria guarda CÓPIAS das perguntas dos
 * participantes (sugestoes_faq e curadoria_rodadas). O PWA só escreve lá para
 * uma coisa: apagar essas cópias quando a pessoa pede para apagar a conversa.
 * Mesmo cuidado do banco acima: nome explícito, nunca deduzido da URI.
 */
const NOME_BANCO_FAQS_PADRAO = 'ministerio_saude';

/** Quanto tempo uma conversa fica guardada antes de se apagar sozinha. */
const RETENCAO_PADRAO_DIAS = 180;

/**
 * O `next dev` recarrega os módulos a cada alteração. Sem guardar o cliente
 * fora do escopo do módulo, cada recarga abriria uma conexão nova e o Atlas
 * chegaria ao teto de conexões do cluster em poucos minutos de trabalho.
 *
 * Guarda o CLIENTE, e não um Db: a exclusão a pedido do titular precisa alcançar
 * dois bancos pela mesma conexão.
 */
const cache = globalThis as unknown as {
  _mongoCliente?: Promise<MongoClient>;
};

async function conectar(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida: o serviço não sobe sem ela.');

  const cliente = new MongoClient(uri, { appName: 'pwa-prototipo' });
  await cliente.connect();

  await criarIndices(cliente.db(process.env.PWA_MONGO_DB || NOME_BANCO_PADRAO));
  return cliente;
}

function cliente(): Promise<MongoClient> {
  cache._mongoCliente ??= conectar();
  return cache._mongoCliente;
}

export async function banco(): Promise<Db> {
  return (await cliente()).db(process.env.PWA_MONGO_DB || NOME_BANCO_PADRAO);
}

export async function bancoDeFaqs(): Promise<Db> {
  return (await cliente()).db(process.env.FAQ_MONGO_DB || NOME_BANCO_FAQS_PADRAO);
}

export function diasDeRetencao(): number {
  const dias = Number(process.env.PWA_RETENCAO_DIAS);
  return Number.isFinite(dias) && dias >= 1 ? Math.floor(dias) : RETENCAO_PADRAO_DIAS;
}

export async function sessoes(): Promise<Collection<Sessao>> {
  return (await banco()).collection<Sessao>('sessoes');
}

export async function mensagens(): Promise<Collection<Mensagem>> {
  return (await banco()).collection<Mensagem>('mensagens');
}

export async function limites(): Promise<Collection<RegistroDeLimite>> {
  return (await banco()).collection<RegistroDeLimite>('limites');
}

export async function contadores(): Promise<Collection<Contador>> {
  return (await banco()).collection<Contador>('contadores');
}

export async function usuarios(): Promise<Collection<Usuario>> {
  return (await banco()).collection<Usuario>('usuarios');
}

export async function contasSessoes(): Promise<Collection<SessaoDeConta>> {
  return (await banco()).collection<SessaoDeConta>('contas_sessoes');
}

export async function inscricoesPush(): Promise<Collection<InscricaoPush>> {
  return (await banco()).collection<InscricaoPush>('inscricoes_push');
}

export async function notificacoes(): Promise<Collection<Notificacao>> {
  return (await banco()).collection<Notificacao>('notificacoes');
}

export async function configuracoes(): Promise<Collection<Configuracao>> {
  return (await banco()).collection<Configuracao>('configuracoes');
}

/**
 * `createIndex` é idempotente: rodar na primeira conexão não custa nada e
 * garante que uma base recriada do zero já nasça indexada.
 */
async function criarIndices(db: Db) {
  await Promise.all([
    // A tela de revisão lista sempre da mais recente para a mais antiga.
    db.collection('sessoes').createIndex({ iniciadaEm: -1 }),
    // Montar uma transcrição é ler todas as mensagens de uma sessão em ordem.
    db.collection('mensagens').createIndex({ sessaoId: 1, em: 1 }),
    // Filtros da revisão: só com polegar para baixo, só com "não encontrei".
    db.collection('mensagens').createIndex({ feedback: 1 }),
    db.collection('mensagens').createIndex({ semResposta: 1 }),
    // O contador de limite se apaga sozinho: sem TTL, a coleção acumularia um
    // documento por IP para sempre.
    db.collection('limites').createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 }),
    // Um contador de participantes por dia: o de ontem não serve para mais nada.
    db.collection('contadores').createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 }),

    // Contas. O índice único no e-mail normalizado é a garantia contra duas
    // contas para a mesma pessoa: a checagem antes do insert é uma corrida,
    // o índice não.
    db.collection('usuarios').createIndex({ emailNormalizado: 1 }, { unique: true }),
    // Único só entre quem TEM googleSub. Com `sparse` não funcionaria: o campo
    // existe com `null` nas contas de senha, e dois nulos violariam o único.
    db
      .collection('usuarios')
      .createIndex(
        { googleSub: 1 },
        { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } },
      ),
    db.collection('contas_sessoes').createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 }),
    db.collection('contas_sessoes').createIndex({ usuarioId: 1 }),
    // Avisos. A fila é lida sempre por "o que está pendente e já venceu", do
    // mais antigo para o mais novo: o índice é exatamente essa consulta.
    db.collection('notificacoes').createIndex({ estado: 1, enviarEm: 1 }),
    db.collection('notificacoes').createIndex({ usuarioId: 1, criadaEm: -1 }),
    db.collection('notificacoes').createIndex({ loteId: 1 }),
    // Aviso que saiu da fila some sozinho depois de um tempo. `expiraEm` só é
    // preenchido na saída, então nada pendente é apagado por engano.
    db.collection('notificacoes').createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 }),
    db.collection('inscricoes_push').createIndex({ usuarioId: 1 }),
    // A exclusão da conta apaga também a marca de aviso já disparado por gatilho.
    db.collection('gatilhos_disparos').createIndex({ usuarioId: 1 }),
    // O histórico de uma conta, e a exclusão em cascata. Parcial porque a
    // imensa maioria das sessões é anônima e não precisa ocupar o índice.
    db
      .collection('sessoes')
      .createIndex(
        { usuarioId: 1, iniciadaEm: -1 },
        { partialFilterExpression: { usuarioId: { $type: 'string' } } },
      ),
  ]);

  await Promise.all([
    garantirRetencao(db, 'sessoes', 'iniciadaEm'),
    garantirRetencao(db, 'mensagens', 'em'),
  ]);
}

/**
 * Prazo de retenção, aplicado pelo próprio Mongo com índice TTL.
 *
 * LÓGICA DO LUCIANO: prazo que depende de alguém lembrar de rodar um script não
 * é prazo. Com TTL o banco apaga sozinho o que passou do tempo, e a política de
 * privacidade pode prometer um número que o sistema de fato cumpre.
 *
 * Mudar `PWA_RETENCAO_DIAS` depois que o índice existe faz o `createIndex`
 * falhar com conflito de opções, e como isto roda na conexão, a falha
 * derrubaria o chat inteiro. Por isso o conflito vira um `collMod`, que só
 * troca o prazo do índice que já está lá.
 *
 * E nenhuma outra falha daqui sobe: um chat fora do ar no meio de um teste
 * presencial é pior que um prazo que não se aplicou, e o erro fica no log com
 * a marca [retenção] para ser achado.
 */
async function garantirRetencao(db: Db, colecao: string, campo: string): Promise<void> {
  const segundos = diasDeRetencao() * 86_400;
  const nome = `retencao_${campo}`;

  try {
    await db
      .collection(colecao)
      .createIndex({ [campo]: 1 }, { name: nome, expireAfterSeconds: segundos });
  } catch (erro) {
    try {
      if (erro instanceof MongoServerError && (erro.code === 85 || erro.code === 86)) {
        await db.command({ collMod: colecao, index: { name: nome, expireAfterSeconds: segundos } });
        return;
      }
      throw erro;
    } catch (falha) {
      console.error(`[retenção] não foi possível aplicar o prazo em ${colecao}:`, falha);
    }
  }
}
