import { contadores } from './db';
import { dataCurta } from './datas';

const FUSO = 'America/Sao_Paulo';

/** Quanto tempo o contador de um dia fica guardado depois do último uso. */
const GUARDA_MS = 2 * 24 * 60 * 60 * 1000;

export type Contador = { _id: string; valor: number; expiraEm: Date };

/**
 * O dia do contador, no fuso de Brasília: a conversa das 22h é do dia em que
 * aconteceu, e não do dia seguinte de Greenwich.
 */
export function diaDoContador(agora: Date): string {
  return agora.toLocaleDateString('sv-SE', { timeZone: FUSO });
}

/** "Participante 7 25/09/2026". */
export function rotuloDoParticipante(numero: number, agora: Date): string {
  return `Participante ${numero} ${dataCurta(agora)}`;
}

/**
 * O nome da próxima conversa, com o número recomeçando a cada dia.
 *
 * LÓGICA DO LUCIANO: o número era a contagem de todas as sessões já criadas, e
 * passava de "Participante 734" sem dizer nada. Por dia, com a data junto, dá
 * para achar "o participante 7 de ontem" num teste presencial. O contador é um
 * incremento atômico, e não uma contagem de sessões: com a turma abrindo o chat
 * ao mesmo tempo, a contagem dava o mesmo número a duas pessoas.
 */
export async function proximoParticipante(agora: Date = new Date()): Promise<string> {
  const col = await contadores();
  const contador = await col.findOneAndUpdate(
    { _id: `participantes:${diaDoContador(agora)}` },
    { $inc: { valor: 1 }, $set: { expiraEm: new Date(agora.getTime() + GUARDA_MS) } },
    { upsert: true, returnDocument: 'after' },
  );
  return rotuloDoParticipante(contador?.valor ?? 1, agora);
}
