// As conversas do teste: o gabarito local, os casos sintéticos e as conversas
// reais lidas do banco do protótipo na hora de rodar.
//
// O gabarito guarda ids de mensagem e de FAQ, e não o texto das perguntas: o
// texto vem do banco. Conversa apagada no banco sai do gabarito na rodada
// seguinte, para a exclusão alcançar também esta cópia de trabalho.
import fs from 'node:fs';

export const CAMINHO_GABARITO = new URL('../.local/gabarito.json', import.meta.url);
export const CAMINHO_SINTETICOS = new URL('../casos-sinteticos.json', import.meta.url);

/** As perguntas de uma sessão, em ordem, com a resposta que o chat gravou na época. */
export async function turnosDaSessao(mensagens, sessaoId) {
  const todas = await mensagens
    .find({ sessaoId, tipo: { $exists: false } }, { projection: { trechosDebug: 0 } })
    .sort({ em: 1 })
    .toArray();
  const respostas = new Map(todas.filter((m) => m.papel === 'bot').map((m) => [m.correlationId, m]));
  return todas
    .filter((m) => m.papel === 'user' && m.texto)
    .map((m) => {
      const r = respostas.get(m.correlationId);
      return {
        mensagemId: String(m._id),
        texto: m.texto,
        em: m.em,
        gravado: r ? { semResposta: Boolean(r.semResposta), erro: Boolean(r.erro), texto: r.texto ?? '' } : null,
      };
    });
}

export function lerGabarito() {
  if (!fs.existsSync(CAMINHO_GABARITO)) return { conversas: [] };
  return JSON.parse(fs.readFileSync(CAMINHO_GABARITO, 'utf8'));
}

export function gravarGabarito(gabarito) {
  fs.mkdirSync(new URL('./', CAMINHO_GABARITO), { recursive: true });
  fs.writeFileSync(CAMINHO_GABARITO, JSON.stringify(gabarito, null, 2) + '\n');
}

/**
 * Monta as conversas do gabarito com o texto do banco. Cada conversa roda do
 * turno `desde` (ou do primeiro) até o último que tem gabarito: os turnos sem
 * gabarito entram para formar o histórico, mas não são avaliados.
 *
 * O `desde` existe para as sessões longas (há sessões de 41 perguntas): o
 * trecho que interessa roda sozinho, sem histórico antes dele, em vez de pagar
 * a sessão inteira. Uma sessão pode aparecer mais de uma vez, com trechos que
 * não se sobrepõem.
 *
 * Devolve também as conversas que sumiram do banco, que o chamador tira do
 * arquivo.
 */
export async function conversasDoGabarito(mensagens, gabarito) {
  const conversas = [];
  const sumiram = [];
  for (const c of gabarito.conversas) {
    const turnos = await turnosDaSessao(mensagens, c.sessaoId);
    const porId = new Map(turnos.map((t, i) => [t.mensagemId, i]));
    if (c.turnos.some((t) => !porId.has(t.mensagemId)) || (c.desde && !porId.has(c.desde))) {
      sumiram.push(c);
      continue;
    }
    const primeiro = c.desde ? porId.get(c.desde) : 0;
    const ultimo = Math.max(...c.turnos.map((t) => porId.get(t.mensagemId)));
    const rotulos = new Map(c.turnos.map((t) => [t.mensagemId, t]));
    conversas.push({
      id: c.desde ? `${c.sessaoId}@${primeiro + 1}` : c.sessaoId,
      sessaoId: c.sessaoId,
      origem: 'real',
      turnos: turnos.slice(primeiro, ultimo + 1).map((t) => ({ ...t, gabarito: rotulos.get(t.mensagemId) ?? null })),
    });
  }
  return { conversas, sumiram };
}

/** Os casos sintéticos: frases escritas para o teste, sem dado de cidadão. */
export function conversasSinteticas() {
  if (!fs.existsSync(CAMINHO_SINTETICOS)) return [];
  const { conversas } = JSON.parse(fs.readFileSync(CAMINHO_SINTETICOS, 'utf8'));
  return conversas.map((c) => ({
    id: c.id,
    origem: 'sintetico',
    turnos: c.turnos.map((t, i) => ({
      mensagemId: `${c.id}#${i + 1}`,
      texto: t.texto,
      gravado: null,
      gabarito: t.partes || t.tipo ? { grupo: t.grupo, tipo: t.tipo ?? 'pergunta', partes: t.partes ?? [], nota: t.nota } : null,
    })),
  }));
}

/** As conversas reais de um dia, sem gabarito, para o modo --dia. */
export async function conversasDoDia(mensagens, dia) {
  // O dia vai da meia-noite à meia-noite de Brasília (UTC-3).
  const inicio = new Date(`${dia}T03:00:00Z`);
  const fim = new Date(inicio.getTime() + 24 * 3600 * 1000);
  const sessoes = await mensagens.distinct('sessaoId', { papel: 'user', em: { $gte: inicio, $lt: fim }, tipo: { $exists: false } });
  const conversas = [];
  for (const sessaoId of sessoes) {
    const turnos = (await turnosDaSessao(mensagens, sessaoId)).filter((t) => t.em < fim);
    if (turnos.length) conversas.push({ id: sessaoId, origem: 'real', turnos: turnos.map((t) => ({ ...t, gabarito: null, doDia: t.em >= inicio })) });
  }
  return conversas;
}
