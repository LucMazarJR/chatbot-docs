import { MongoClient } from 'mongodb';

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
 * sem erro nenhum. Aqui isso não pode acontecer.
 */

const NOME_BANCO_PADRAO = 'pwa_prototipo';

let client = null;
let db = null;

export async function conectar(log) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI não definida — o serviço não sobe sem ela.');
  }

  const nomeBanco = process.env.PWA_MONGO_DB || NOME_BANCO_PADRAO;

  client = new MongoClient(uri, { appName: 'pwa-prototipo' });
  await client.connect();
  db = client.db(nomeBanco);

  await criarIndices();

  log?.info({ banco: nomeBanco }, 'Mongo conectado');
  return db;
}

export async function desconectar() {
  await client?.close();
  client = null;
  db = null;
}

export function sessoes() {
  return db.collection('sessoes');
}

export function mensagens() {
  return db.collection('mensagens');
}

/**
 * `createIndex` é idempotente: rodar a cada boot não custa nada e garante que
 * uma base recriada do zero já nasça indexada.
 */
async function criarIndices() {
  await Promise.all([
    // A tela de revisão lista sempre da mais recente para a mais antiga.
    sessoes().createIndex({ iniciadaEm: -1 }),
    // Montar uma transcrição é ler todas as mensagens de uma sessão em ordem.
    mensagens().createIndex({ sessaoId: 1, em: 1 }),
    // Filtros da revisão: só com polegar para baixo, só com "não encontrei".
    mensagens().createIndex({ feedback: 1 }),
    mensagens().createIndex({ semResposta: 1 }),
  ]);
}

/** Verifica se o banco responde, para o /health. */
export async function ping() {
  await db.command({ ping: 1 });
}
