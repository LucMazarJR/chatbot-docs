import type { Mensagem } from './tipos';

/** Teto de uma gravação, com folga sobre o minuto da tela. */
const MAXIMO_SEGUNDOS = 120;

/**
 * Os dados do áudio que a tela manda junto da pergunta transcrita.
 *
 * Vêm do navegador, então são conferidos e cortados: a duração precisa ser um
 * número razoável, e o modelo e o tempo da transcrição são só registro. Valor
 * estranho não vira erro, vira "não é mensagem de áudio": a pergunta segue
 * como texto, que é o que ela é no fim.
 */
export function lerAudio(valor: unknown): NonNullable<Mensagem['audio']> | null {
  const dados = (valor ?? null) as { duracaoSegundos?: unknown; modelo?: unknown; transcricaoMs?: unknown } | null;
  const duracao = Number(dados?.duracaoSegundos);
  if (!dados || !Number.isFinite(duracao) || duracao < 1 || duracao > MAXIMO_SEGUNDOS) return null;

  const ms = Number(dados.transcricaoMs);
  return {
    duracaoSegundos: Math.round(duracao),
    transcritoPor: 'ia',
    modelo: typeof dados.modelo === 'string' ? dados.modelo.slice(0, 60) : null,
    transcricaoMs: Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null,
  };
}
