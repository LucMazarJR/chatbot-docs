// Testa os nós de código do fluxo de staging fora do n8n, com entradas simuladas.
//
// Uso: node n8n/testar-codigo-staging.mjs
//
// O n8n não tem teste de unidade, e estes nós decidem o que o agente recebe:
// qual consulta sai da reescrita, o que acontece quando ela falha e como os
// trechos de várias buscas se misturam. Rodar isto depois de mexer neles.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fluxo = JSON.parse(fs.readFileSync(new URL('./pwa-chatbot-staging.json', import.meta.url), 'utf8'));
const codigo = (nome) => fluxo.nodes.find((n) => n.name === nome).parameters.jsCode;

/** Roda o jsCode de um nó com `$('Nó')` e `$input` simulados. */
function rodar(nome, { nos = {}, entrada = [] }) {
  const $ = (outro) => ({ first: () => ({ json: nos[outro] }), all: () => [{ json: nos[outro] }] });
  const $input = { first: () => entrada[0], all: () => entrada };
  return new Function('$', '$input', codigo(nome))($, $input);
}

const dados = { TextoMensagem: 'endereço nga', IdChat: 'pwa:1', EventId: 'm1', Historico: '[]' };

// --- Montar reescrita ---------------------------------------------------------
{
  const [saida] = rodar('Montar reescrita', {
    nos: { Dados: { ...dados, Historico: JSON.stringify([{ papel: 'user', texto: 'onde fica o nga 16' }, { papel: 'bot', texto: 'Fica na Rua X.' }]) } },
  });
  const texto = saida.json.corpo.contents[0].parts[0].text;
  assert.match(texto, /Cidadão: onde fica o nga 16\nAssistente: Fica na Rua X\./);
  assert.match(texto, /Mensagem nova do cidadão:\nendereço nga$/);
  assert.equal(saida.json.corpo.generationConfig.responseMimeType, 'application/json');
  console.log('ok: a reescrita recebe a conversa e a mensagem nova');
}

const reescrita = (obj) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });
const baseReescrita = { ...dados, InicioReescrita: Date.now() - 900, corpo: {} };

// --- Consultas ------------------------------------------------------------------
{
  const itens = rodar('Consultas', {
    nos: { 'Montar reescrita': baseReescrita },
    entrada: [reescrita({ tipo: 'pergunta', perguntaCompleta: 'Qual o endereço do NGA?', consultas: ['Onde fica o NGA 16?', 'Onde fica o NGA 16?', 'Endereço das unidades de saúde'] })],
  });
  assert.deepEqual(itens.map((i) => i.json.TextoBusca), ['Onde fica o NGA 16?', 'Endereço das unidades de saúde']);
  assert.equal(itens[0].json.PularBusca, false);
  assert.equal(itens[0].json.corpo, undefined, 'o corpo do pedido não segue adiante');
  assert.ok(itens[0].json.ReescritaMs >= 900);
  console.log('ok: cada consulta vira uma busca, sem repetir');
}
{
  const [item] = rodar('Consultas', {
    nos: { 'Montar reescrita': baseReescrita },
    entrada: [{ json: { error: { message: 'timeout of 8000ms exceeded' } } }],
  });
  assert.equal(item.json.TextoBusca, 'endereço nga');
  assert.equal(item.json.ReescritaFalhou, true);
  console.log('ok: reescrita que falha busca com o texto original');
}
{
  const itens = rodar('Consultas', {
    nos: { 'Montar reescrita': { ...baseReescrita, TextoMensagem: 'bom dia' } },
    entrada: [reescrita({ tipo: 'saudacao', perguntaCompleta: 'bom dia', consultas: [] })],
  });
  assert.equal(itens.length, 1);
  assert.equal(itens[0].json.PularBusca, true);
  console.log('ok: saudação pula a busca');
}
{
  const itens = rodar('Consultas', {
    nos: { 'Montar reescrita': baseReescrita },
    entrada: [reescrita({ tipo: 'fora_de_escopo', perguntaCompleta: 'x', consultas: [] })],
  });
  assert.equal(itens[0].json.PularBusca, false, 'fora de escopo ainda busca');
  console.log('ok: fora de escopo ainda busca');
}

// --- Montar contexto --------------------------------------------------------------
const consultasDados = { ...dados, Consultas: ['específica', 'geral'], PerguntaCompleta: 'x', Tipo: 'pergunta' };
const trecho = (indiceConsulta, id, score) => ({
  json: { score, document: { pageContent: '', metadata: { _id: id, question: `FAQ ${id}`, answer: `Resposta ${id}` } } },
  pairedItem: { item: indiceConsulta },
});
{
  // A consulta específica traz dez variações quase iguais com score alto; a
  // geral traz a FAQ certa com score um pouco menor. O rodízio põe a da geral
  // em segundo lugar, e não em décimo primeiro.
  const especificas = Array.from({ length: 10 }, (_, i) => trecho(0, `remedio-${i}`, 0.9 - i * 0.001));
  const gerais = [trecho(1, 'receita-vencida', 0.88), trecho(1, 'remedio-0', 0.87)];
  const [saida] = rodar('Montar contexto', { nos: { Consultas: consultasDados }, entrada: [...especificas, ...gerais] });
  const usados = saida.json.TrechosDebug.filter((t) => t.usado).map((t) => t.faqId);
  // A ordem que importa é a do contexto que o agente lê.
  const ordem = [...saida.json.ContextoFaq.matchAll(/Resposta (\S+)/g)].map((m) => m[1]);
  assert.equal(saida.json.QtdTrechos, 10);
  assert.deepEqual(ordem.slice(0, 2), ['remedio-0', 'receita-vencida']);
  assert.equal(new Set(usados).size, usados.length, 'a mesma FAQ não entra duas vezes');
  assert.equal(saida.json.TrechosDebug.find((t) => t.faqId === 'receita-vencida').consulta, 'geral');
  console.log('ok: rodízio entre as consultas, sem FAQ repetida');
}
{
  // A consulta geral traz muita coisa acima do corte; só as 3 melhores entram.
  const gerais = Array.from({ length: 8 }, (_, i) => trecho(1, `geral-${i}`, 0.89 - i * 0.001));
  const [saida] = rodar('Montar contexto', {
    nos: { Consultas: consultasDados },
    entrada: [trecho(0, 'especifica', 0.85), ...gerais],
  });
  const usados = saida.json.TrechosDebug.filter((t) => t.usado).map((t) => t.faqId);
  assert.deepEqual(usados, ['especifica', 'geral-0', 'geral-1', 'geral-2']);
  console.log('ok: consulta extra traz no máximo 3 trechos');
}
{
  const [saida] = rodar('Montar contexto', {
    nos: { Consultas: consultasDados },
    entrada: [trecho(0, 'baixo', 0.79), trecho(1, 'baixo-2', 0.81)],
  });
  assert.equal(saida.json.TemContexto, false);
  assert.equal(saida.json.TrechosDebug.length, 2, 'os descartados continuam nos bastidores');
  console.log('ok: o corte de 0.82 continua valendo');
}
{
  const [saida] = rodar('Montar contexto', {
    nos: { Consultas: { ...consultasDados, Tipo: 'saudacao' } },
    entrada: [{ json: { ...consultasDados, PularBusca: true } }],
  });
  assert.equal(saida.json.TemContexto, false);
  assert.equal(saida.json.TrechosDebug.length, 0);
  console.log('ok: sem busca, o agente recebe contexto vazio');
}

console.log('todos os testes passaram');
