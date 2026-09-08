/**
 * Freio de mão contra queimar a cota do Gemini.
 *
 * O acesso é aberto de propósito (o link circula entre participantes), mas a
 * cota gratuita é de 500 conversas/dia. Sem nenhum limite, uma aba deixada
 * segurando F5 — ou alguém curioso com o link — derruba o teste do dia inteiro.
 *
 * Janela deslizante em memória: reiniciar o container zera, e tudo bem. Isto é
 * proteção contra acidente, não contra ataque.
 */

const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 40;

// Sobrevive ao recarregamento de módulos do `next dev`, como a conexão do Mongo.
const cache = globalThis as unknown as { _limite?: Map<string, number[]> };
cache._limite ??= new Map();

export function dentroDoLimite(chave: string): boolean {
  const historico = cache._limite!;
  const agora = Date.now();

  const marcas = (historico.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  marcas.push(agora);
  historico.set(chave, marcas);

  // Limpeza preguiçosa: sem isto o Map cresce para sempre com IPs de uma visita.
  if (historico.size > 500) {
    for (const [outra, tempos] of historico) {
      if (tempos.every((t) => agora - t >= JANELA_MS)) historico.delete(outra);
    }
  }

  return marcas.length <= MAX_POR_JANELA;
}

/** O proxy é o cloudflared; sem ler o cabeçalho, o IP de todos seria o da rede docker. */
export function identificar(requisicao: Request): string {
  const encaminhado = requisicao.headers.get('x-forwarded-for');
  return encaminhado?.split(',')[0]?.trim() || 'desconhecido';
}
