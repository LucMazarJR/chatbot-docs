import type { Db } from 'mongodb';

import type { TipoNotificacao } from '@/lib/notificacoes/tipos';

/**
 * Um aviso que o gatilho quer mandar.
 *
 * É só o que muda de um aviso para outro. O resto do documento da fila
 * (estado, tentativas, recibo, entregas) quem monta é o executor, sempre do
 * mesmo jeito: ver `montarNotificacao` em `regras.ts`.
 */
export type AvisoDoGatilho = {
  /** A conta que recebe. Precisa ter os avisos ativados em algum aparelho. */
  usuarioId: string;
  /**
   * O fato que gerou o aviso, único dentro do gatilho: `consulta-8841`,
   * `boas-vindas-<usuarioId>`. A mesma chave nunca gera dois avisos, então o
   * gatilho pode devolver o mesmo fato em toda verificação sem medo.
   *
   * Fica guardada para sempre: nada de dado de saúde nela, só identificadores.
   */
  chave: string;
  /** O texto que a pessoa lê dentro do chat. */
  detalhe: string;
  /** Depois disto o aviso é descartado em vez de chegar atrasado. */
  validaAte: Date;
  /** A partir de quando pode sair. Sem ele, sai na próxima rodada do despachante. */
  enviarEm?: Date;
  /**
   * Mostrar o texto também na tela bloqueada. Falso por padrão, e só deve ser
   * ligado para texto que não diga nada sobre a saúde de ninguém.
   */
  mostrarDetalhe?: boolean;
};

export type ContextoDoGatilho = {
  agora: Date;
  /** O banco do chat (`pwa_prototipo`): contas, inscrições, sessões. */
  db: Db;
  /** Quando este gatilho rodou pela última vez, ou `null` na primeira. */
  ultimaExecucao: Date | null;
};

export type Gatilho = {
  /** Letras minúsculas, números e hífen. É o que vai em `GATILHOS_ATIVOS`. */
  id: string;
  /** Uma frase: aparece nos registros e no guia. */
  descricao: string;
  /** De quantos em quantos minutos o executor chama `verificar`. */
  aCadaMinutos: number;
  /** O tipo define o título que aparece na tela bloqueada. */
  tipo: Exclude<TipoNotificacao, 'teste'>;
  verificar: (contexto: ContextoDoGatilho) => Promise<AvisoDoGatilho[]>;
};

const ID_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Declara um gatilho, conferindo o que dá para conferir antes de rodar.
 *
 * Um id com espaço ou maiúscula não bateria com o que alguém escreve em
 * `GATILHOS_ATIVOS`, e o gatilho ficaria desligado sem ninguém saber por quê.
 */
export function definirGatilho(gatilho: Gatilho): Gatilho {
  if (!ID_VALIDO.test(gatilho.id)) {
    throw new Error(`Gatilho com id inválido: "${gatilho.id}". Use minúsculas, números e hífen.`);
  }
  if (!(gatilho.aCadaMinutos >= 1)) {
    throw new Error(`Gatilho "${gatilho.id}": aCadaMinutos precisa ser 1 ou mais.`);
  }
  return gatilho;
}
