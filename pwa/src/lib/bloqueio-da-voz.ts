/**
 * Quando a voz por IA fica bloqueada, e o que a tela diz sobre isso.
 *
 * O plano gratuito tem pouca cota. Quando ela acaba (ou a pessoa passa do
 * limite dela), a opção fica bloqueada até a hora que o servidor mandou
 * (`voltaEm`), a voz do celular assume, e a tela diz quando a IA volta. Sem
 * o bloqueio, cada áudio e cada "Ouvir" tentava o servidor de novo, esperava
 * a recusa e só então caía na voz do celular.
 *
 * Lógica pura, sem navegador: o gancho `usar-voz-ia.ts` guarda e aplica.
 */

/** As duas partes da voz por IA, que acabam separadas: entender o áudio e falar a resposta. */
export type ParteDaVoz = 'audio' | 'vozNatural';

export type Bloqueio = {
  /** Até quando, em ms. `Infinity` quando não há hora para voltar. */
  ate: number;
  /**
   * `dia`: a cota do Google ou o nosso teto. `pessoa`: o limite de cada conta.
   * `ambiente`: o servidor não tem a chave. `agora`: o servidor não respondeu.
   */
  motivo: 'dia' | 'pessoa' | 'ambiente' | 'agora';
};

export type Bloqueios = Partial<Record<ParteDaVoz, Bloqueio>>;

/** O bloqueio que uma recusa do servidor pede, ou `null` se ela não bloqueia. */
export function bloqueioDaRecusa(
  recusa: { falha?: string; voltaEm?: string } | null | undefined,
  agora: number,
): Bloqueio | null {
  const ate = recusa?.voltaEm ? Date.parse(recusa.voltaEm) : NaN;
  if (!Number.isFinite(ate) || ate <= agora) return null;
  if (recusa?.falha === 'pessoa') return { ate, motivo: 'pessoa' };
  if (recusa?.falha === 'esgotada' || recusa?.falha === 'cota') return { ate, motivo: 'dia' };
  return null;
}

/** Os bloqueios que a situação do servidor (`/api/voz/estado`) pede. */
export function bloqueiosDaSituacao(
  situacao: { audio?: boolean; vozNatural?: boolean; motivo?: string; voltaEm?: string },
  agora: number,
): Bloqueios {
  const bloqueios: Bloqueios = {};
  const doDia = situacao.motivo === 'esgotada' ? bloqueioDaRecusa({ falha: 'esgotada', voltaEm: situacao.voltaEm }, agora) : null;
  if (!situacao.audio && doDia) bloqueios.audio = doDia;
  if (!situacao.vozNatural && doDia) bloqueios.vozNatural = doDia;
  return bloqueios;
}

/** Só os que ainda valem. */
export function vigentes(bloqueios: Bloqueios, agora: number): Bloqueios {
  const ainda: Bloqueios = {};
  for (const parte of ['audio', 'vozNatural'] as const) {
    const bloqueio = bloqueios[parte];
    if (bloqueio && bloqueio.ate > agora) ainda[parte] = bloqueio;
  }
  return ainda;
}

function partes(instante: number, fuso?: string) {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const valor = (tipo: string) => formato.formatToParts(instante).find((parte) => parte.type === tipo)?.value ?? '';
  return { dia: `${valor('year')}-${valor('month')}-${valor('day')}`, hora: Number(valor('hour')), minuto: Number(valor('minute')) };
}

/**
 * A frase curta que aparece embaixo da opção bloqueada.
 *
 * Diz a hora, e não "amanhã cedo": a cota volta às 4h ou às 5h de Brasília, e
 * quem é bloqueado de madrugada recebe a voz de volta no mesmo dia. `fuso` só
 * existe para o teste; no aparelho vale o fuso dele.
 */
export function explicarBloqueio(bloqueio: Bloqueio, agora: number, fuso?: string): string {
  if (bloqueio.motivo === 'ambiente') return 'Não está ligada neste ambiente.';
  if (bloqueio.motivo === 'agora') return 'Indisponível agora. Tente mais tarde.';
  if (bloqueio.motivo === 'pessoa') {
    const minutos = Math.max(1, Math.ceil((bloqueio.ate - agora) / 60_000));
    return `Muitos seguidos. Volta em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
  }
  const volta = partes(bloqueio.ate, fuso);
  const hora = volta.minuto ? `${volta.hora}h${String(volta.minuto).padStart(2, '0')}` : `${volta.hora}h`;
  return volta.dia === partes(agora, fuso).dia
    ? `Acabou por agora. Volta hoje às ${hora}.`
    : `Acabou por hoje. Volta amanhã às ${hora}.`;
}
