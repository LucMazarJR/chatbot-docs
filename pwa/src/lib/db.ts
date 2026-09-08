import { MongoClient, type Collection, type Db } from 'mongodb';

import type { Mensagem, Sessao } from './tipos';

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
 *    tem isso dentro — sem risco de levar FAQ junto.
 *
 * O banco é escolhido EXPLICITAMENTE por nome, e não pelo caminho da
 * `MONGODB_URI`. Essa é a armadilha nº 1 do projeto (ver docs/chatbot.md,
 * Passo 1): uma URI sem nome de banco faz o driver assumir `test` em silêncio,
 * sem erro nenhum.
 */

const NOME_BANCO_PADRAO = 'pwa_prototipo';

/**
 * O `next dev` recarrega os módulos a cada alteração. Sem guardar o cliente
 * fora do escopo do módulo, cada recarga abriria uma conexão nova e o Atlas
 * chegaria ao teto de conexões do cluster em poucos minutos de trabalho.
 */
const cache = globalThis as unknown as {
  _mongo?: Promise<Db>;
};

async function abrir(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida — o serviço não sobe sem ela.');

  const cliente = new MongoClient(uri, { appName: 'pwa-prototipo' });
  await cliente.connect();

  const db = cliente.db(process.env.PWA_MONGO_DB || NOME_BANCO_PADRAO);
  await criarIndices(db);
  return db;
}

export function banco(): Promise<Db> {
  cache._mongo ??= abrir();
  return cache._mongo;
}

export async function sessoes(): Promise<Collection<Sessao>> {
  return (await banco()).collection<Sessao>('sessoes');
}

export async function mensagens(): Promise<Collection<Mensagem>> {
  return (await banco()).collection<Mensagem>('mensagens');
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
  ]);
}
