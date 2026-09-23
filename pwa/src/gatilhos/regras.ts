import type { Notificacao } from '@/lib/notificacoes/tipos';

import type { AvisoDoGatilho, Gatilho } from './tipos';

/** O mesmo teto do formulário do painel: texto maior não cabe na tela do aviso. */
export const DETALHE_MAXIMO = 1000;

/**
 * Teto de avisos por gatilho em cada rodada.
 *
 * Um gatilho com defeito (uma consulta sem filtro, uma data errada) pode
 * devolver a base inteira. Sem teto, isso vira uma notificação em cada
 * celular de uma vez, e notificação enviada não volta.
 */
export const LIMITE_POR_RODADA = 200;

export const CHAVE_MAXIMA = 200;

/** `GATILHOS_ATIVOS=boas-vindas, consulta-amanha` vira a lista de ids. */
export function idsAtivos(valor: string | undefined): string[] {
  return [
    ...new Set(
      (valor ?? '')
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function estaNaHora(ultima: Date | null, aCadaMinutos: number, agora: Date): boolean {
  if (!ultima) return true;
  return agora.getTime() - ultima.getTime() >= aCadaMinutos * 60 * 1000;
}

export type Descarte = { chave: string; motivo: string };

/**
 * Confere o que o gatilho devolveu e separa o que pode ir para a fila.
 *
 * O motivo do descarte vai para o registro da execução, e por isso nunca cita
 * o texto do aviso: só a chave, que é um identificador.
 */
export function prepararAvisos(
  avisos: AvisoDoGatilho[],
  agora: Date,
  limite = LIMITE_POR_RODADA,
): { validos: AvisoDoGatilho[]; descartes: Descarte[] } {
  const validos: AvisoDoGatilho[] = [];
  const descartes: Descarte[] = [];
  const vistas = new Set<string>();

  for (const aviso of avisos) {
    const chave = typeof aviso?.chave === 'string' ? aviso.chave.trim() : '';
    const descartar = (motivo: string) => descartes.push({ chave: chave || '(sem chave)', motivo });

    if (!chave) {
      descartar('sem chave');
      continue;
    }
    if (chave.length > CHAVE_MAXIMA) {
      descartar(`chave com mais de ${CHAVE_MAXIMA} caracteres`);
      continue;
    }
    if (vistas.has(chave)) {
      descartar('chave repetida na mesma verificação');
      continue;
    }
    if (typeof aviso.usuarioId !== 'string' || !aviso.usuarioId.trim()) {
      descartar('sem usuarioId');
      continue;
    }
    const detalhe = typeof aviso.detalhe === 'string' ? aviso.detalhe.trim() : '';
    if (!detalhe) {
      descartar('sem texto');
      continue;
    }
    if (detalhe.length > DETALHE_MAXIMO) {
      descartar(`texto com mais de ${DETALHE_MAXIMO} caracteres`);
      continue;
    }
    if (!(aviso.validaAte instanceof Date) || Number.isNaN(aviso.validaAte.getTime())) {
      descartar('sem validade');
      continue;
    }
    if (aviso.validaAte.getTime() <= agora.getTime()) {
      descartar('validade já passou');
      continue;
    }
    const enviarEm = aviso.enviarEm ?? agora;
    if (!(enviarEm instanceof Date) || Number.isNaN(enviarEm.getTime())) {
      descartar('data de envio inválida');
      continue;
    }
    if (enviarEm.getTime() >= aviso.validaAte.getTime()) {
      descartar('validade termina antes do envio');
      continue;
    }
    if (validos.length >= limite) {
      descartar(`passou do teto de ${limite} avisos por rodada`);
      continue;
    }

    vistas.add(chave);
    validos.push({ ...aviso, chave, detalhe, enviarEm });
  }

  return { validos, descartes };
}

/**
 * O lote de uma rodada, para o painel agrupar os avisos dela numa linha só.
 *
 * O prefixo `gatilho:` é o que separa, na fila, o que saiu de um gatilho do
 * que alguém da equipe mandou pelo painel.
 */
export function loteDaRodada(gatilhoId: string, agora: Date): string {
  return `gatilho:${gatilhoId}:${agora.toISOString().slice(0, 16)}`;
}

/**
 * O documento da fila, com todos os campos.
 *
 * LÓGICA DO LUCIANO: é o mesmo formato de `montarAvisos` no back do painel e
 * do aviso de teste. Campo faltando ou com nome errado não dá erro em lugar
 * nenhum: o despachante só não encontra o aviso, e ele fica parado na fila
 * para sempre. Por isso quem escreve um gatilho não monta este documento.
 */
export function montarNotificacao(
  gatilho: Pick<Gatilho, 'id' | 'tipo'>,
  aviso: AvisoDoGatilho,
  agora: Date,
  loteId: string,
  id: string,
): Notificacao {
  return {
    _id: id,
    loteId,
    usuarioId: aviso.usuarioId,
    tipo: gatilho.tipo,
    detalhe: aviso.detalhe,
    mostrarDetalhe: aviso.mostrarDetalhe === true,
    enviarEm: aviso.enviarEm ?? agora,
    validaAte: aviso.validaAte,
    estado: 'pendente',
    tentativas: 0,
    travadaAte: null,
    recibo: null,
    entregas: [],
    motivo: null,
    criadaEm: agora,
    criadaPor: `Gatilho: ${gatilho.id}`,
    enviadaEm: null,
    recebidaEm: null,
    exibidaEm: null,
    abertaEm: null,
    expiraEm: null,
  };
}
