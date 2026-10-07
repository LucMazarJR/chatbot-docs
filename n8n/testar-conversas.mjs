// Teste de conversas: roda conversas inteiras, turno a turno, nos fluxos do
// chat, fora do n8n, e confere cada resposta contra a FAQ esperada.
//
// Uso:
//   node n8n/testar-conversas.mjs                      gabarito e casos sintéticos, no / e no staging
//   node n8n/testar-conversas.mjs --fluxos raiz,staging,git:main:n8n/pwa-chatbot-staging.json
//   node n8n/testar-conversas.mjs --so continuacao     um grupo só: continuacao, partes, curta, exame, geral, controle
//   node n8n/testar-conversas.mjs --caso <sessão>      uma conversa só
//   node n8n/testar-conversas.mjs --so-busca           só a busca e o contexto, sem resposta nem juiz
//   node n8n/testar-conversas.mjs --dia 2026-09-29     as conversas reais de um dia, sem gabarito
//   node n8n/testar-conversas.mjs --sessao <sessão>    as perguntas de uma conversa, com as FAQs candidatas
//   node n8n/testar-conversas.mjs --buscar "texto" [--buscar "outro"] [--palavra "regex"]
//   node n8n/testar-conversas.mjs --faq <id>[,<id>]    uma FAQ inteira
//   node n8n/testar-conversas.mjs --limpar-cache
//
// Só lê os bancos. Usa a GEMINI_API_KEY_3 na triagem (reescrita e embeddings) e
// a GEMINI_API_KEY_4 na análise (resposta e juiz), com a GEMINI_API_KEY de
// reserva quando a cota do dia da _4 acaba. A chave do chat em uso nunca entra.
// O gabarito, o cache e os relatórios ficam em n8n/.local, fora do git, porque
// têm frases de cidadão ou texto derivado delas.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lerAmbiente, argumento, argumentos, opcao } from './lib/ambiente.mjs';
import { criarCliente, CotaEsgotada } from './lib/gemini.mjs';
import { abrirBanco, buscarVetorial, ObjectIdDe } from './lib/busca.mjs';
import { carregarFluxo } from './lib/fluxo.mjs';
import { criarCache } from './lib/cache.mjs';
import { criarExecutor } from './lib/executar.mjs';
import { criarJuiz, RE_NAO_ENCONTREI, VEREDITOS, pesoDoVeredito } from './lib/juiz.mjs';
import {
  turnosDaSessao,
  lerGabarito,
  gravarGabarito,
  conversasDoGabarito,
  conversasSinteticas,
  conversasDoDia,
} from './lib/conversas.mjs';

const APELIDOS = { raiz: 'n8n/pwa-chatbot.json', staging: 'n8n/pwa-chatbot-staging.json' };
const MODELO_EMBEDDING = 'gemini-embedding-2';
// O juiz é o flash-lite porque os modelos maiores têm 20 chamadas por dia no
// plano gratuito, e uma rodada completa julga mais de cem respostas. Ele só
// roda nas respostas que não são "não encontrei", e o veredito fica no cache.
const MODELO_JUIZ = argumento('juiz', 'gemini-3.1-flash-lite');
const PARALELO = Number(argumento('paralelo', '3'));

const pasta = (relativo) => fileURLToPath(new URL(relativo, import.meta.url));
const env = lerAmbiente();
const cache = criarCache(pasta('./.local/cache/'));

if (opcao('limpar-cache')) {
  cache.limpar();
  console.log('Cache apagado.');
  process.exit(0);
}

const triagem = criarCliente({ papel: 'triagem', chaves: [{ nome: 'GEMINI_API_KEY_3', valor: env.GEMINI_API_KEY_3 }] });
// A análise usa a _4 e, quando a cota do dia dela acaba, a GEMINI_API_KEY (a
// do fluxo do WhatsApp). O juiz não faz parte do chat e começa pela
// GEMINI_API_KEY, para os dois não dividirem o mesmo limite por minuto. A _2 é
// a do chat do PWA e nunca entra: o teste não pode gastar a cota de quem está
// conversando.
const chave4 = { nome: 'GEMINI_API_KEY_4', valor: env.GEMINI_API_KEY_4 };
const chave1 = { nome: 'GEMINI_API_KEY', valor: env.GEMINI_API_KEY };
const analise = criarCliente({ papel: 'análise', chaves: [chave4, chave1] });
const clienteDoJuiz = criarCliente({ papel: 'juiz', chaves: [chave1, chave4] });
const banco = await abrirBanco(env);

// --- Ferramentas para montar o gabarito --------------------------------------

async function vetorDe(texto) {
  const r = await cache.ou('embedding', { modelo: MODELO_EMBEDDING, texto }, async () => {
    const { vetor, ms } = await triagem.embedding(MODELO_EMBEDDING, texto);
    return { vetor, ms };
  });
  return r.vetor;
}

const linhaDeFaq = (d) =>
  `   ${d.score !== undefined ? d.score.toFixed(3) : '     '} ${String(d._id)} [${d.category ?? ''}] ${d.question ?? ''}`;

async function modoBuscar() {
  for (const texto of argumentos('buscar')) {
    const docs = await buscarVetorial(banco.faqs, await vetorDe(texto), { topK: Number(argumento('k', '15')) });
    console.log(`\n>> ${texto}`);
    console.log(docs.map(linhaDeFaq).join('\n'));
  }
  const palavra = argumento('palavra');
  if (palavra) {
    const re = new RegExp(palavra, 'i');
    const docs = await banco.faqs
      .find({ isActive: true, $or: [{ question: re }, { category: re }] }, { projection: { question: 1, category: 1 } })
      .limit(40)
      .toArray();
    console.log(`\n>> palavra /${palavra}/: ${docs.length}`);
    console.log(docs.map(linhaDeFaq).join('\n'));
  }
}

async function modoFaq(ids) {
  const docs = await banco.faqs
    .find({ _id: { $in: ids.map(ObjectIdDe) } }, { projection: { question: 1, answer: 1, category: 1, isActive: 1 } })
    .toArray();
  for (const d of docs) {
    console.log(`\n${String(d._id)} [${d.category ?? ''}]${d.isActive ? '' : ' (INATIVA)'}\nP: ${d.question}\nR: ${d.answer}`);
  }
}

async function modoSessao(sessaoId) {
  const turnos = await turnosDaSessao(banco.mensagens, sessaoId);
  if (!turnos.length) {
    console.log('Nenhuma pergunta nessa sessão. Confira o id.');
    return;
  }
  // `--de` e `--ate` limitam as perguntas que ganham busca: numa sessão longa,
  // só o trecho que vai para o gabarito precisa gastar embedding.
  const de = Number(argumento('de', '1'));
  const ate = Number(argumento('ate', String(turnos.length)));
  for (const [i, t] of turnos.entries()) {
    const gravado = t.gravado ? (t.gravado.erro ? 'ERRO' : t.gravado.semResposta ? 'SEM RESPOSTA' : 'respondida') : 'sem resposta gravada';
    console.log(`\n${i + 1}. ${t.mensagemId} [${gravado}] ${t.texto}`);
    if (i + 1 < de || i + 1 > ate) continue;
    if (t.gravado?.texto) console.log(`   chat: ${t.gravado.texto.replace(/\s+/g, ' ').slice(0, 220)}`);
    const docs = await buscarVetorial(banco.faqs, await vetorDe(t.texto), { topK: 10 });
    console.log(docs.map(linhaDeFaq).join('\n'));
  }
}

// --- Rodar os fluxos -----------------------------------------------------------

function executoresDosFluxos() {
  const referencias = argumento('fluxos', 'raiz,staging')
    .split(',')
    .map((r) => APELIDOS[r.trim()] ?? r.trim());
  return referencias.map((referencia) =>
    criarExecutor({ fluxo: carregarFluxo(referencia), triagem, analise, banco, cache }),
  );
}

async function emParalelo(itens, limite, tarefa) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    while (fila.length) await tarefa(fila.shift());
  });
  await Promise.all(trabalhadores);
}

/** Roda cada conversa em cada fluxo e devolve os resultados por fluxo e por turno. */
async function rodar(executores, conversas, { juiz, soBusca = false } = {}) {
  const resultados = new Map(executores.map((e) => [e.referencia, new Map()]));
  let feitas = 0;
  for (const executor of executores) {
    await emParalelo(conversas, PARALELO, async (conversa) => {
      const estado = executor.novoEstado(conversa.id);
      for (const turno of conversa.turnos) {
        const historico = estado.historico.slice(-4);
        const resultado = await executor.turno(estado, turno.texto, { soBusca });
        const avaliacao =
          turno.gabarito && juiz && !soBusca
            ? await juiz.avaliar({ gabarito: turno.gabarito, historico, texto: turno.texto, resultado })
            : null;
        resultados.get(executor.referencia).set(turno.mensagemId, { conversa, turno, resultado, avaliacao });
      }
      feitas++;
      process.stdout.write(`\r${feitas} de ${conversas.length * executores.length} conversas rodadas`);
    });
  }
  process.stdout.write('\n');
  return resultados;
}

// --- Medidas e relatório ----------------------------------------------------------

const pct = (n, total) => (total ? `${Math.round((100 * n) / total)}%` : '-');
const ordenados = (xs) => [...xs].sort((a, b) => a - b);
const percentil = (xs, p) => (xs.length ? ordenados(xs)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)] : 0);
const segundos = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Onde a FAQ esperada apareceu: posição e nota em cada busca, e se entrou no contexto. */
function presencaDaEsperada(resultado, ids) {
  const nasBuscas = resultado.buscas.map((b) => {
    const i = b.resultados.findIndex((r) => ids.includes(r.faqId));
    return i >= 0 ? { posicao: i + 1, score: b.resultados[i].score } : null;
  });
  return {
    naBusca: nasBuscas.some(Boolean),
    noContexto: resultado.usados.some((id) => ids.includes(id)),
    nasBuscas,
  };
}

function resumoDoFluxo(referencia, porTurno, filtroDeGrupo) {
  const comGabarito = [...porTurno.values()].filter((r) => r.turno.gabarito && (!filtroDeGrupo || r.turno.gabarito.grupo === filtroDeGrupo));
  const avaliados = comGabarito.filter((r) => r.avaliacao);
  const contagem = Object.fromEntries(VEREDITOS.map((v) => [v, 0]));
  for (const r of avaliados) contagem[r.avaliacao.veredito]++;
  let partesComFaq = 0;
  let naBusca = 0;
  let noContexto = 0;
  // A presença da FAQ esperada não depende da resposta: vale também no --so-busca.
  for (const r of comGabarito) {
    for (const parte of r.turno.gabarito.partes ?? []) {
      if (!parte.faqs.length) continue;
      partesComFaq++;
      const p = presencaDaEsperada(r.resultado, parte.faqs);
      if (p.naBusca) naBusca++;
      if (p.noContexto) noContexto++;
    }
  }
  return { referencia, turnos: comGabarito.length, total: avaliados.length, contagem, partesComFaq, naBusca, noContexto };
}

function linhaDeContagem({ total, contagem }) {
  return VEREDITOS.filter((v) => contagem[v])
    .map((v) => `${v} ${contagem[v]} (${pct(contagem[v], total)})`)
    .join(' | ');
}

function imprimirResumo(executores, resultados) {
  const grupos = [...new Set([...resultados.values()].flatMap((m) => [...m.values()].map((r) => r.turno.gabarito?.grupo).filter(Boolean)))];
  for (const e of executores) {
    const porTurno = resultados.get(e.referencia);
    const geral = resumoDoFluxo(e.referencia, porTurno);
    console.log(`\n${e.referencia} (${e.formato}): ${geral.turnos} turnos com gabarito, ${geral.total} julgados`);
    if (geral.total) console.log(`  ${linhaDeContagem(geral)}`);
    console.log(`  FAQ esperada na busca: ${pct(geral.naBusca, geral.partesComFaq)} | no contexto do agente: ${pct(geral.noContexto, geral.partesComFaq)} (${geral.partesComFaq} partes com FAQ)`);
    for (const g of grupos) {
      const r = resumoDoFluxo(e.referencia, porTurno, g);
      if (!r.turnos) continue;
      const contexto = `FAQ no contexto ${pct(r.noContexto, r.partesComFaq)}`;
      console.log(`  ${g.padEnd(12)} ${r.turnos} turnos: ${r.total ? `${linhaDeContagem(r)} | ` : ''}${contexto}`);
    }
    const todos = [...porTurno.values()].map((r) => r.resultado);
    const analise = todos.map((r) => r.tempos.analise).filter(Boolean);
    const triagemMs = todos.map((r) => r.tempos.triagem).filter(Boolean);
    const total = todos.map((r) => r.tempos.triagem + r.tempos.embedding + r.tempos.busca + r.tempos.analise);
    // Chamadas que o fluxo faz por pergunta, tenham ou não vindo do cache aqui:
    // é o que a pergunta custa na cota de verdade.
    const chamadas = todos.map((r) => (r.triagem ? 1 : 0) + r.buscas.length + (r.soBusca ? 0 : 1 + (r.falhas?.length ?? 0)));
    console.log(
      `  tempo: total mediana ${segundos(percentil(total, 0.5))}, p90 ${segundos(percentil(total, 0.9))}` +
        (triagemMs.length ? ` | triagem mediana ${segundos(percentil(triagemMs, 0.5))}` : '') +
        (analise.length ? ` | análise mediana ${segundos(percentil(analise, 0.5))}` : '') +
        ` | chamadas por pergunta ${(chamadas.reduce((a, b) => a + b, 0) / Math.max(1, chamadas.length)).toFixed(1)}`,
    );
  }
}

/** O `/` reproduzido tem que concordar com o que o `/` de verdade gravou. */
function imprimirFidelidade(resultados) {
  const raiz = resultados.get(APELIDOS.raiz);
  if (!raiz) return;
  const comparaveis = [...raiz.values()].filter((r) => r.turno.gravado && !r.turno.gravado.erro && r.resultado.resposta);
  if (!comparaveis.length) return;
  const diferentes = comparaveis.filter((r) => RE_NAO_ENCONTREI.test(r.resultado.resposta) !== r.turno.gravado.semResposta);
  console.log(
    `\nFidelidade do / reproduzido: concorda com o "não encontrei" gravado em ${pct(comparaveis.length - diferentes.length, comparaveis.length)} ` +
      `dos ${comparaveis.length} turnos.`,
  );
  for (const r of diferentes.slice(0, 15)) {
    console.log(`  - ${r.turno.texto.slice(0, 70)} | gravado: ${r.turno.gravado.semResposta ? 'não encontrei' : 'respondeu'}`);
  }
}

function imprimirComparacao(executores, resultados) {
  if (executores.length < 2) return;
  const [base, ...outros] = executores;
  for (const outro of outros) {
    const piorou = [];
    const melhorou = [];
    for (const [id, r] of resultados.get(outro.referencia)) {
      const antes = resultados.get(base.referencia).get(id);
      if (!r.avaliacao || !antes?.avaliacao) continue;
      const d = pesoDoVeredito(r.avaliacao.veredito) - pesoDoVeredito(antes.avaliacao.veredito);
      if (d < 0) piorou.push([r, antes]);
      if (d > 0) melhorou.push([r, antes]);
    }
    console.log(`\n${base.referencia} -> ${outro.referencia}: melhorou em ${melhorou.length}, piorou em ${piorou.length}`);
    for (const [r, antes] of piorou) {
      console.log(`  piorou: ${r.turno.texto.slice(0, 70)} | ${antes.avaliacao.veredito} -> ${r.avaliacao.veredito}`);
    }
  }
}

async function gravarRelatorio(executores, conversas, resultados) {
  const ids = [...new Set(conversas.flatMap((c) => c.turnos.flatMap((t) => (t.gabarito?.partes ?? []).flatMap((p) => p.faqs))))];
  const docs = await banco.faqs.find({ _id: { $in: ids.map(ObjectIdDe) } }, { projection: { question: 1, category: 1, isActive: 1 } }).toArray();
  const faq = new Map(docs.map((d) => [String(d._id), d]));
  const linhas = [`# Teste de conversas, ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, ''];
  linhas.push(`Fluxos: ${executores.map((e) => e.referencia).join(', ')}`, '');
  for (const c of conversas) {
    linhas.push(`## ${c.origem === 'sintetico' ? 'Sintético' : 'Conversa'} ${c.id}`, '');
    for (const t of c.turnos) {
      linhas.push(`### ${t.gabarito ? `[${t.gabarito.grupo ?? '-'}]` : '(contexto)'} ${t.texto.replace(/\s+/g, ' ')}`);
      if (t.gravado) linhas.push(`Gravado na época: ${t.gravado.erro ? 'erro' : t.gravado.semResposta ? 'não encontrei' : 'respondeu'}`);
      for (const [i, p] of (t.gabarito?.partes ?? []).entries()) {
        const esperadas = p.faqs.map((id) => {
          const d = faq.get(id);
          return d ? `${d.question} [${d.category}]${d.isActive ? '' : ' (INATIVA)'}` : `${id} (NÃO EXISTE MAIS)`;
        });
        linhas.push(`Parte ${i + 1}${p.descricao ? ` (${p.descricao})` : ''}: ${esperadas.length ? esperadas.join(' ou ') : 'a base não tem'}`);
      }
      for (const e of executores) {
        const r = resultados.get(e.referencia).get(t.mensagemId);
        if (!r) continue;
        const res = r.resultado;
        linhas.push('', `**${e.referencia}**: ${r.avaliacao ? r.avaliacao.veredito : '(sem gabarito)'}`);
        if (res.triagem) linhas.push(`- triagem: ${res.triagem.tipo} | ${res.triagem.perguntaCompleta} | consultas: ${res.triagem.consultas.join(' / ')}${res.triagem.falhou ? ` | FALHOU: ${res.triagem.falhou}` : ''}`);
        for (const [i, p] of (t.gabarito?.partes ?? []).entries()) {
          if (!p.faqs.length) continue;
          const presenca = presencaDaEsperada(res, p.faqs);
          const posicoes = presenca.nasBuscas.map((x) => (x ? `${x.posicao}º (${x.score.toFixed(3)})` : 'fora')).join(', ');
          linhas.push(`- parte ${i + 1}: nas buscas ${posicoes}; ${presenca.noContexto ? 'no contexto' : 'fora do contexto'}`);
        }
        linhas.push(`- trechos no contexto: ${res.usados.length}; modelo: ${res.modelo ?? 'nenhum respondeu'}`);
        linhas.push(`- resposta: ${(res.resposta ?? '(falhou)').replace(/\s+/g, ' ').slice(0, 400)}`);
        for (const n of r.avaliacao?.notas ?? []) linhas.push(`- juiz: ${n}`);
      }
      linhas.push('');
    }
  }
  // O nome segue o horário de Brasília, o mesmo do cabeçalho do relatório.
  const nome = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 19).replace(/[: ]/g, '-');
  const caminho = pasta(`./.local/relatorios/${nome}.md`);
  fs.mkdirSync(pasta('./.local/relatorios/'), { recursive: true });
  fs.writeFileSync(caminho, linhas.join('\n'));
  // Os dados crus vão junto, para medir outra coisa depois (outro corte de
  // nota, por exemplo) sem gastar a cota rodando tudo de novo.
  const crus = executores.map((e) => ({
    fluxo: e.referencia,
    turnos: [...resultados.get(e.referencia).values()].map((r) => ({
      conversa: r.conversa.id,
      mensagemId: r.turno.mensagemId,
      gabarito: r.turno.gabarito,
      resultado: r.resultado,
      avaliacao: r.avaliacao,
    })),
  }));
  fs.writeFileSync(caminho.replace(/\.md$/, '.json'), JSON.stringify(crus));
  return caminho;
}

// --- Modos de rodar ------------------------------------------------------------

async function modoGabarito() {
  const gabarito = lerGabarito();
  const { conversas: reais, sumiram } = await conversasDoGabarito(banco.mensagens, gabarito);
  if (sumiram.length) {
    // A conversa foi apagada (ou a mensagem sumiu): ela sai do gabarito também.
    gabarito.conversas = gabarito.conversas.filter((c) => !sumiram.includes(c));
    gravarGabarito(gabarito);
    console.log(`${sumiram.length} trecho(s) de conversa não existem mais no banco e saíram do gabarito.`);
  }
  let conversas = [...reais, ...conversasSinteticas()];
  const so = argumento('so');
  const caso = argumento('caso');
  if (caso) conversas = conversas.filter((c) => c.id.startsWith(caso));
  if (so) conversas = conversas.filter((c) => c.turnos.some((t) => t.gabarito?.grupo === so));
  if (!conversas.length) {
    console.log('Nenhuma conversa para rodar. Confira o gabarito em n8n/.local/gabarito.json e os filtros.');
    return;
  }
  const turnos = conversas.reduce((n, c) => n + c.turnos.filter((t) => t.gabarito).length, 0);
  console.log(`Teste de conversas: ${conversas.length} conversas, ${turnos} turnos com gabarito.`);

  const executores = executoresDosFluxos();
  const soBusca = opcao('so-busca');
  const juiz = criarJuiz({ cliente: clienteDoJuiz, modelo: MODELO_JUIZ, cache, faqs: banco.faqs });
  const resultados = await rodar(executores, conversas, { juiz, soBusca });

  imprimirResumo(executores, resultados);
  if (!soBusca) {
    imprimirFidelidade(resultados);
    imprimirComparacao(executores, resultados);
  }
  console.log(`\nRelatório detalhado (só local): ${await gravarRelatorio(executores, conversas, resultados)}`);
  console.log(`Chamadas ao Gemini nesta rodada: triagem ${triagem.chamadas}, análise ${analise.chamadas}, juiz ${clienteDoJuiz.chamadas}.`);

  // Só a rodada completa (todas as conversas, os dois fluxos de sempre, com
  // resposta e juiz) sabe tudo que ainda é usado. Uma rodada filtrada apagaria
  // o cache dos outros grupos, dos outros fluxos ou das respostas.
  const completa = !so && !caso && !soBusca && !argumento('fluxos');
  if (completa) {
    const apagados = cache.podar();
    if (apagados) console.log(`Cache: ${apagados} entrada(s) que nenhuma conversa usa mais foram apagadas.`);
  }
}

async function modoDia(dia) {
  const conversas = await conversasDoDia(banco.mensagens, dia);
  if (!conversas.length) {
    console.log(`Nenhuma conversa em ${dia}.`);
    return;
  }
  const executores = executoresDosFluxos();
  const resultados = await rodar(executores, conversas);
  const doDia = (r) => r.turno.doDia;
  for (const e of executores) {
    const turnos = [...resultados.get(e.referencia).values()].filter(doDia);
    const falhas = turnos.filter((r) => !r.resultado.resposta).length;
    const naoEncontrei = turnos.filter((r) => r.resultado.resposta && RE_NAO_ENCONTREI.test(r.resultado.resposta)).length;
    const semTrecho = turnos.filter((r) => r.resultado.usados.length === 0).length;
    console.log(`\n${e.referencia}: ${turnos.length} perguntas | não encontrei ${naoEncontrei} (${pct(naoEncontrei, turnos.length)}) | sem nenhum trecho ${semTrecho} | falhas ${falhas}`);
  }
  if (executores.length > 1) {
    const [a, b] = executores;
    console.log(`\nOnde ${a.referencia} e ${b.referencia} discordam sobre "não encontrei":`);
    for (const [id, r] of resultados.get(b.referencia)) {
      const antes = resultados.get(a.referencia).get(id);
      if (!doDia(r) || !r.resultado.resposta || !antes?.resultado.resposta) continue;
      const x = RE_NAO_ENCONTREI.test(antes.resultado.resposta);
      const y = RE_NAO_ENCONTREI.test(r.resultado.resposta);
      if (x !== y) console.log(`  ${x ? 'agora responde' : 'agora não encontra'}: ${r.turno.texto.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
}

// O modo escolhido roda por último: as funções e constantes acima já existem.
try {
  if (argumento('faq')) await modoFaq(argumento('faq').split(','));
  else if (argumentos('buscar').length || argumento('palavra')) await modoBuscar();
  else if (argumento('sessao')) await modoSessao(argumento('sessao'));
  else if (argumento('dia')) await modoDia(argumento('dia'));
  else await modoGabarito();
} catch (erro) {
  if (!(erro instanceof CotaEsgotada)) throw erro;
  console.log(`\n${erro.message}`);
  process.exitCode = 2;
} finally {
  await banco.fechar();
}
