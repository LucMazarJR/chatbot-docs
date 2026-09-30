// Mede o que a reescrita da pergunta muda na busca, com perguntas reais de um dia.
//
// Uso:
//   node n8n/avaliar-reescrita.mjs --calibrar
//   node n8n/avaliar-reescrita.mjs --dia 2026-09-29 [--respondidas 20] [--saida arquivo.json]
//
// Só lê: nada é gravado em banco. Para cada pergunta sem resposta do dia (e
// uma amostra das respondidas, como controle), faz a busca como o fluxo sem
// reescrita e como o fluxo de staging, e compara o que cada uma traria ao
// agente. O prompt é lido do próprio pwa-chatbot-staging.json, entre os
// marcadores INICIO-DO-PROMPT e FIM-DO-PROMPT: a avaliação mede exatamente o
// que o fluxo faz.
//
// Usa a GEMINI_API_KEY_3 do .env da raiz (a mesma da credencial "Gemini
// Reescrita"), para não gastar a cota do chat.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const exigir = createRequire(new URL('../pwa/package.json', import.meta.url));
const { MongoClient } = exigir('mongodb');

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const argumento = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const CHAVE = env.GEMINI_API_KEY_3;
const LIMIAR = 0.82;
const TOP_K = 10;
const MAXIMO_TRECHOS = 10;
const MAXIMO_POR_CONSULTA_EXTRA = 3;
const MODELO_REESCRITA = 'gemini-3.1-flash-lite';
const MODELO_EMBEDDING = 'gemini-embedding-2';

if (!CHAVE) throw new Error('GEMINI_API_KEY_3 ausente no .env da raiz.');

// --- O prompt, lido do fluxo ----------------------------------------------------
const fluxo = JSON.parse(fs.readFileSync(new URL('./pwa-chatbot-staging.json', import.meta.url), 'utf8'));
const codigoReescrita = fluxo.nodes.find((n) => n.name === 'Montar reescrita').parameters.jsCode;
const blocoPrompt = /\/\/ INICIO-DO-PROMPT\n([\s\S]*?)\n\/\/ FIM-DO-PROMPT/.exec(codigoReescrita)?.[1];
if (!blocoPrompt) throw new Error('Marcadores do prompt não encontrados no fluxo.');
const PROMPT = new Function(`${blocoPrompt}; return PROMPT;`)();
const ESQUEMA = JSON.parse(/responseSchema: (\{.*\}),\n/.exec(codigoReescrita)[1]);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma chamada, com espera quando bate no limite por minuto da cota gratuita.
 *
 * O tempo devolvido é o da tentativa que deu certo: as esperas são desta
 * avaliação, que faz dezenas de chamadas seguidas, e não do chat, que faz uma
 * por mensagem.
 */
async function gemini(caminho, corpo) {
  for (let tentativa = 0; ; tentativa++) {
    const inicio = Date.now();
    let resposta;
    try {
      resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/${caminho}?key=${CHAVE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
    } catch (erro) {
      // Conexão caída no meio (ECONNRESET): numa avaliação de dezenas de
      // chamadas, acontece. Tenta de novo antes de desistir da pergunta.
      if (tentativa < 4) {
        await esperar(5000 * (tentativa + 1));
        continue;
      }
      throw erro;
    }
    if (resposta.ok) return { ...(await resposta.json()), _ms: Date.now() - inicio };
    // Cota por minuto e sobrecarga passam sozinhas; o resto é erro de verdade.
    if ((resposta.status === 429 || resposta.status === 503) && tentativa < 4) {
      await esperar(15000 * (tentativa + 1));
      continue;
    }
    throw new Error(`Gemini ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
  }
}

async function embedding(texto, taskType) {
  const dados = await gemini(`models/${MODELO_EMBEDDING}:embedContent`, {
    content: { parts: [{ text: texto }] },
    ...(taskType ? { taskType } : {}),
  });
  return dados.embedding.values;
}

async function reescrever(mensagem, conversa) {
  const texto = [
    PROMPT,
    '',
    conversa.length ? 'Conversa até aqui:\n' + conversa.join('\n') : 'Conversa até aqui: nenhuma.',
    '',
    'Mensagem nova do cidadão:',
    mensagem,
  ].join('\n');
  const dados = await gemini(`models/${MODELO_REESCRITA}:generateContent`, {
    contents: [{ role: 'user', parts: [{ text: texto }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: 'application/json', responseSchema: ESQUEMA },
  });
  const ms = dados._ms;
  const lido = JSON.parse(dados.candidates[0].content.parts.map((p) => p.text || '').join(''));
  return { ...lido, ms };
}

const cliente = new MongoClient(env.MONGODB_URI);
await cliente.connect();
const faqs = cliente.db('ministerio_saude').collection('faq_medicamentos');

async function buscar(vetor) {
  return faqs
    .aggregate([
      {
        $vectorSearch: {
          index: 'vector_index_3072',
          path: 'embedding',
          queryVector: vetor,
          numCandidates: TOP_K * 10,
          limit: TOP_K,
          filter: { isActive: true },
        },
      },
      { $project: { question: 1, category: 1, score: { $meta: 'vectorSearchScore' } } },
    ])
    .toArray();
}

/** A mesma mistura do nó "Montar contexto" do staging: rodízio entre as consultas. */
function misturar(listas) {
  const ordenadas = listas.map((l, indice) => {
    const acima = l.filter((t) => t.score >= LIMIAR).sort((a, b) => b.score - a.score);
    return indice === 0 ? acima : acima.slice(0, MAXIMO_POR_CONSULTA_EXTRA);
  });
  const escolhidos = [];
  const vistos = new Set();
  for (let rodada = 0; escolhidos.length < MAXIMO_TRECHOS && ordenadas.some((l) => l.length > rodada); rodada++) {
    for (const lista of ordenadas) {
      const t = lista[rodada];
      if (!t || vistos.has(String(t._id)) || escolhidos.length >= MAXIMO_TRECHOS) continue;
      vistos.add(String(t._id));
      escolhidos.push(t);
    }
  }
  return escolhidos;
}

const inicioDoDia = (dia) => new Date(`${dia}T03:00:00Z`);

async function perguntasDoDia(dia) {
  const mensagens = cliente.db(env.PWA_MONGO_DB || 'pwa_prototipo').collection('mensagens');
  const inicio = inicioDoDia(dia);
  const fim = new Date(inicio.getTime() + 24 * 3600 * 1000);
  const todas = await mensagens.find({ em: { $gte: new Date(inicio.getTime() - 3600 * 1000), $lt: fim } }).sort({ em: 1, papel: -1 }).toArray();
  const respostas = new Map(todas.filter((m) => m.papel === 'bot').map((m) => [m.correlationId, m]));
  const trocas = [];
  for (const m of todas) {
    if (m.papel !== 'user' || m.tipo || m.em < inicio) continue;
    const resposta = respostas.get(m.correlationId);
    if (!resposta || resposta.pendente || resposta.erro) continue;
    const anteriores = todas
      .filter((x) => x.sessaoId === m.sessaoId && x.em < m.em && !x.pendente && x.texto)
      .slice(-4)
      .map((x) => (x.papel === 'user' ? 'Cidadão: ' : 'Assistente: ') + x.texto.replace(/\s+/g, ' ').slice(0, 300));
    trocas.push({ pergunta: m.texto, semResposta: Boolean(resposta.semResposta), gravado: resposta.trechosDebug ?? [], conversa: anteriores });
  }
  return trocas;
}

if (process.argv.includes('--calibrar')) {
  // Qual configuração de embedding reproduz os scores que o n8n gravou.
  const trocas = (await perguntasDoDia(argumento('dia', '2026-09-29'))).slice(0, 4);
  for (const taskType of [null, 'RETRIEVAL_QUERY', 'SEMANTIC_SIMILARITY']) {
    const diferencas = [];
    for (const t of trocas) {
      const [melhor] = await buscar(await embedding(t.pergunta, taskType));
      diferencas.push(Math.abs((melhor?.score ?? 0) - (t.gravado[0]?.score ?? 0)).toFixed(4));
    }
    console.log(`taskType ${taskType ?? '(nenhum)'}: diferença para o gravado ${diferencas.join(' ')}`);
  }
  await cliente.close();
  process.exit(0);
}

const TASK_TYPE = argumento('task', '') || null;
const dia = argumento('dia', '2026-09-29');
const quantasRespondidas = Number(argumento('respondidas', '20'));
const trocas = await perguntasDoDia(dia);
const semResposta = trocas.filter((t) => t.semResposta);
const respondidas = trocas.filter((t) => !t.semResposta);
const passo = Math.max(1, Math.floor(respondidas.length / quantasRespondidas));
const amostra = [...semResposta, ...respondidas.filter((_, i) => i % passo === 0).slice(0, quantasRespondidas)];

console.log(`${dia}: ${semResposta.length} sem resposta e ${Math.min(quantasRespondidas, respondidas.length)} respondidas de controle\n`);

const resultados = [];
const perdidas = [];
for (const [i, t] of amostra.entries()) {
  try {
    resultados.push(await avaliar(i, t));
  } catch (erro) {
    // Uma pergunta que falhou de vez não derruba a avaliação inteira: ela
    // sai do resumo e aparece na contagem de perdidas.
    perdidas.push(t.pergunta);
    console.log(`${i + 1}. PERDIDA (${erro.message.slice(0, 120)}): ${t.pergunta}`);
  }
  await esperar(300);
}

async function avaliar(i, t) {
  const antes = await buscar(await embedding(t.pergunta, TASK_TYPE));
  const passaAntes = antes.filter((x) => x.score >= LIMIAR);
  let reescrita;
  try {
    reescrita = await reescrever(t.pergunta, t.conversa);
  } catch (erro) {
    reescrita = { tipo: 'pergunta', perguntaCompleta: t.pergunta, consultas: [t.pergunta], ms: null, falhou: erro.message };
  }
  const consultas = reescrita.tipo === 'saudacao' ? [] : (reescrita.consultas?.length ? reescrita.consultas : [t.pergunta]);
  const listas = [];
  for (const c of consultas) listas.push(await buscar(await embedding(c, TASK_TYPE)));
  const depois = misturar(listas);
  const idsAntes = new Set(passaAntes.map((x) => String(x._id)));
  const novas = depois.filter((x) => !idsAntes.has(String(x._id)));

  const r = {
    pergunta: t.pergunta,
    semResposta: t.semResposta,
    conversa: t.conversa.length,
    perguntaCompleta: reescrita.perguntaCompleta,
    tipo: reescrita.tipo,
    consultas,
    reescritaMs: reescrita.ms,
    falhou: reescrita.falhou ?? null,
    antes: { melhor: antes[0]?.score ?? 0, passam: passaAntes.length, top: passaAntes.slice(0, 3).map((x) => x.question) },
    depois: { passam: depois.length, top: depois.slice(0, 4).map((x) => `${x.score.toFixed(3)} ${x.question}`) },
    novas: novas.slice(0, 4).map((x) => `${x.score.toFixed(3)} ${x.question}`),
  };
  console.log(`${i + 1}. [${t.semResposta ? 'SEM RESPOSTA' : 'respondida'}] ${t.pergunta}`);
  console.log(`   entendida: ${r.perguntaCompleta} | consultas: ${consultas.join(' || ')} | ${r.reescritaMs ?? '?'} ms${r.falhou ? ' | FALHOU: ' + r.falhou : ''}`);
  console.log(`   antes: ${r.antes.passam} acima do corte (melhor ${r.antes.melhor.toFixed(3)}) | depois: ${r.depois.passam}`);
  if (r.novas.length) console.log(`   FAQs novas no contexto: ${r.novas.join(' | ')}`);
  return r;
}

const semAntes = resultados.filter((r) => r.semResposta && r.antes.passam === 0);
const ganharam = semAntes.filter((r) => r.depois.passam > 0);
const comNovas = resultados.filter((r) => r.semResposta && r.novas.length > 0);
const controlePerdeu = resultados.filter((r) => !r.semResposta && r.depois.passam === 0 && r.antes.passam > 0);
const tempos = resultados.map((r) => r.reescritaMs).filter((x) => typeof x === 'number').sort((a, b) => a - b);
const percentil = (p) => tempos[Math.min(tempos.length - 1, Math.ceil(p * tempos.length) - 1)];

console.log('\nResumo');
console.log(`- Sem resposta e sem nenhum trecho antes: ${semAntes.length}; passaram a ter trecho: ${ganharam.length}`);
console.log(`- Sem resposta que passaram a trazer FAQ que não vinha antes: ${comNovas.length} de ${resultados.filter((r) => r.semResposta).length}`);
console.log(`- Respondidas de controle que perderam todo trecho: ${controlePerdeu.length}`);
console.log(`- Reescrita: mediana ${percentil(0.5)} ms, p90 ${percentil(0.9)} ms, falhas ${resultados.filter((r) => r.falhou).length}`);
if (perdidas.length) console.log(`- Perguntas perdidas por erro de rede ou cota: ${perdidas.length}`);

const saida = argumento('saida', null);
if (saida) fs.writeFileSync(saida, JSON.stringify(resultados, null, 2));
await cliente.close();
