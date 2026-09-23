import { randomUUID } from 'node:crypto';

import { MongoServerError, type Db } from 'mongodb';

import { banco } from '@/lib/db';
import type { Notificacao } from '@/lib/notificacoes/tipos';

import { GATILHOS } from './index';
import { estaNaHora, idsAtivos, loteDaRodada, montarNotificacao, prepararAvisos, type Descarte } from './regras';
import type { Gatilho } from './tipos';

/**
 * Uma linha por gatilho: quando rodou e o que aconteceu.
 *
 * É o registro de que o gatilho agiu, e com base em quê: quantos avisos ele
 * propôs, quantos foram para a fila e por que os outros ficaram de fora. Sem o
 * texto dos avisos, que pode falar de exame ou consulta.
 */
type Execucao = {
  _id: string;
  ultimaEm: Date;
  ensaio: boolean;
  propostos: number;
  criados: number;
  repetidos: number;
  descartes: Descarte[];
  erro: string | null;
};

/**
 * A marca de que uma chave já virou aviso. É o que impede o mesmo fato de
 * notificar duas vezes, mesmo que o gatilho o devolva em toda verificação.
 */
type Disparo = {
  /** `<gatilho>:<chave>`: o índice único do `_id` é a trava contra repetição. */
  _id: string;
  gatilhoId: string;
  /** Para a exclusão da conta alcançar também este registro. */
  usuarioId: string;
  notificacaoId: string;
  criadoEm: Date;
};

export type ResultadoDoGatilho = Omit<Execucao, '_id' | 'ultimaEm'> & { id: string };

let rodadaEmAndamento: Promise<ResultadoDoGatilho[]> | null = null;
const avisadosDesconhecidos = new Set<string>();

/**
 * Roda os gatilhos ligados em `GATILHOS_ATIVOS` que já estão na hora.
 *
 * Seguro de chamar de novo no meio de uma rodada: quem chega recebe a mesma.
 * Com `GATILHOS_ENSAIO=1`, verifica e registra o que faria, sem gravar aviso.
 */
export function rodarGatilhos(opcoes: { agora?: Date; ativos?: string[]; ensaio?: boolean; forcar?: boolean } = {}) {
  if (!rodadaEmAndamento) {
    rodadaEmAndamento = rodada(opcoes).finally(() => {
      rodadaEmAndamento = null;
    });
  }
  return rodadaEmAndamento;
}

async function rodada({
  agora = new Date(),
  ativos = idsAtivos(process.env.GATILHOS_ATIVOS),
  ensaio = process.env.GATILHOS_ENSAIO === '1',
  forcar = false,
}: {
  agora?: Date;
  ativos?: string[];
  ensaio?: boolean;
  forcar?: boolean;
}): Promise<ResultadoDoGatilho[]> {
  if (ativos.length === 0) return [];

  // Id na variável que não existe no código é quase sempre erro de digitação.
  // Avisa uma vez por processo, para não encher o log a cada minuto.
  for (const id of ativos) {
    if (!GATILHOS.some((g) => g.id === id) && !avisadosDesconhecidos.has(id)) {
      avisadosDesconhecidos.add(id);
      console.warn(`[gatilhos] "${id}" está em GATILHOS_ATIVOS, mas não existe em pwa/src/gatilhos/index.ts.`);
    }
  }

  const db = await banco();
  const execucoes = db.collection<Execucao>('gatilhos_execucoes');
  const resultados: ResultadoDoGatilho[] = [];

  for (const gatilho of GATILHOS.filter((g) => ativos.includes(g.id))) {
    const anterior = await execucoes.findOne({ _id: gatilho.id });
    const ultimaEm = anterior?.ultimaEm ?? null;
    if (!forcar && !estaNaHora(ultimaEm, gatilho.aCadaMinutos, agora)) continue;

    const resultado = await rodarUm(db, gatilho, agora, ultimaEm, ensaio);
    resultados.push(resultado);

    const { ensaio: foiEnsaio, propostos, criados, repetidos, descartes, erro } = resultado;
    await execucoes.updateOne(
      { _id: gatilho.id },
      { $set: { ensaio: foiEnsaio, propostos, criados, repetidos, descartes, erro, ultimaEm: agora } },
      { upsert: true },
    );

    if (resultado.criados > 0 || resultado.erro || resultado.descartes.length > 0 || ensaio) {
      console.log(
        `[gatilhos] ${gatilho.id}${ensaio ? ' (ensaio)' : ''}: ${resultado.propostos} propostos, ` +
          `${resultado.criados} na fila, ${resultado.repetidos} repetidos, ` +
          `${resultado.descartes.length} descartados${resultado.erro ? `, erro: ${resultado.erro}` : ''}`,
      );
    }
  }

  return resultados;
}

async function rodarUm(
  db: Db,
  gatilho: Gatilho,
  agora: Date,
  ultimaExecucao: Date | null,
  ensaio: boolean,
): Promise<ResultadoDoGatilho> {
  const vazio = { id: gatilho.id, ensaio, propostos: 0, criados: 0, repetidos: 0, descartes: [], erro: null };

  let propostos;
  try {
    propostos = await gatilho.verificar({ agora, db, ultimaExecucao });
  } catch (erro) {
    // Só a mensagem: o objeto de erro pode carregar o documento que o gatilho
    // estava lendo.
    return { ...vazio, erro: (erro as Error).message ?? 'erro desconhecido' };
  }
  if (!Array.isArray(propostos)) {
    return { ...vazio, erro: 'verificar não devolveu uma lista' };
  }

  const { validos, descartes } = prepararAvisos(propostos, agora);
  const resultado: ResultadoDoGatilho = { ...vazio, propostos: propostos.length, descartes };
  const disparos = db.collection<Disparo>('gatilhos_disparos');

  if (ensaio) {
    // Confere as marcas sem gravar: o ensaio mostra o que sairia de verdade,
    // e não conta de novo o que já foi avisado.
    const ids = validos.map((aviso) => `${gatilho.id}:${aviso.chave}`);
    resultado.repetidos = await disparos.countDocuments({ _id: { $in: ids } });
    resultado.criados = validos.length - resultado.repetidos;
    return resultado;
  }

  const fila = db.collection<Notificacao>('notificacoes');
  const loteId = loteDaRodada(gatilho.id, agora);

  for (const aviso of validos) {
    const notificacaoId = randomUUID();
    try {
      await disparos.insertOne({
        _id: `${gatilho.id}:${aviso.chave}`,
        gatilhoId: gatilho.id,
        usuarioId: aviso.usuarioId,
        notificacaoId,
        criadoEm: agora,
      });
    } catch (erro) {
      if (erro instanceof MongoServerError && erro.code === 11000) {
        resultado.repetidos += 1;
        continue;
      }
      throw erro;
    }

    try {
      await fila.insertOne(montarNotificacao(gatilho, aviso, agora, loteId, notificacaoId));
      resultado.criados += 1;
    } catch (erro) {
      // Sem o aviso na fila, a marca de disparo impediria de tentar de novo.
      await disparos.deleteOne({ _id: `${gatilho.id}:${aviso.chave}` });
      resultado.erro = `falha ao gravar na fila: ${(erro as Error).message}`;
    }
  }

  return resultado;
}
