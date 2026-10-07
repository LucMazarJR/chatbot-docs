// O banco e a busca vetorial, do jeito que o nó "Buscar FAQs" do n8n faz.
//
// O nó usa o MongoDBAtlasVectorSearch do LangChain, que pede numCandidates
// igual a 10 vezes o topK e devolve cada documento inteiro em `metadata`, com
// `pageContent` vazio (o campo de texto configurado no nó não existe na
// coleção). Os nós "Montar contexto" foram escritos para esse formato, e são
// eles que rodam no teste: por isso a saída aqui imita o item do n8n.
import { exigir } from './ambiente.mjs';

const { MongoClient, ObjectId } = exigir('mongodb');

/** O id de FAQ guardado como texto, de volta ao tipo do banco. */
export const ObjectIdDe = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : id);

export async function abrirBanco(env) {
  if (!env.MONGODB_URI) throw new Error('Falta a MONGODB_URI no .env da raiz.');
  const cliente = new MongoClient(env.MONGODB_URI);
  await cliente.connect();
  const prototipo = cliente.db(env.PWA_MONGO_DB || 'pwa_prototipo');
  return {
    faqs: cliente.db('ministerio_saude').collection('faq_medicamentos'),
    mensagens: prototipo.collection('mensagens'),
    sessoes: prototipo.collection('sessoes'),
    fechar: () => cliente.close(),
  };
}

export async function buscarVetorial(faqs, vetor, { topK = 10, filtro = { isActive: true } } = {}) {
  return faqs
    .aggregate([
      {
        $vectorSearch: {
          index: 'vector_index_3072',
          path: 'embedding',
          queryVector: vetor,
          numCandidates: topK * 10,
          limit: topK,
          filter: filtro,
        },
      },
      { $set: { score: { $meta: 'vectorSearchScore' } } },
      { $project: { embedding: 0 } },
    ])
    .toArray();
}

/**
 * O item que o nó do n8n emite para um documento. O `_id` chega aos nós de
 * código como texto, porque os dados passam serializados entre os nós.
 */
export function itemDoN8n(doc, indiceDaEntrada = 0) {
  const { score, ...resto } = doc;
  return {
    json: { document: { pageContent: '', metadata: { ...resto, _id: String(resto._id) } }, score },
    pairedItem: { item: indiceDaEntrada },
  };
}

/** O resumo de um resultado de busca que o relatório usa. */
export function resumoDoResultado(doc) {
  return { faqId: String(doc._id), score: Number(doc.score.toFixed(4)), question: doc.question ?? null, category: doc.category ?? null };
}
