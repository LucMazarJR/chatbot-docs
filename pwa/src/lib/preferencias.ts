'use client';

/**
 * Tema e tamanho do texto, escolhidos pelo participante.
 *
 * LÓGICA DO LUCIANO: isto é acessibilidade, não enfeite. O protótipo vai a posto
 * de saúde, onde boa parte de quem vai testar tem presbiopia e usa o telefone
 * com a fonte do sistema no máximo — e o chat ignorava a fonte do sistema, por
 * medir tudo em px para imitar o WhatsApp. Sem um controle próprio, essas
 * pessoas simplesmente não conseguiriam ler as respostas que vieram avaliar, e a
 * validação mediria a visão delas em vez da qualidade do assistente.
 *
 * Fica em `localStorage`, junto da sessão: a escolha precisa sobreviver ao
 * refresh, senão a pessoa reajusta a cada vez que troca de aplicativo e volta.
 */

export type Tema = 'claro' | 'escuro' | 'auto';

export type Escala = { id: string; rotulo: string; valor: number };

/**
 * Quatro degraus, e não um controle contínuo.
 *
 * Um slider exige mira fina — justamente o que falta a quem tem tremor, que é
 * parte do público. Com degraus, errar o toque muda um passo, e o passo seguinte
 * corrige.
 */
export const ESCALAS: Escala[] = [
  { id: 'sm', rotulo: 'Pequeno', valor: 0.875 },
  { id: 'md', rotulo: 'Médio', valor: 1 },
  { id: 'lg', rotulo: 'Grande', valor: 1.15 },
  { id: 'xl', rotulo: 'Extra grande', valor: 1.3 },
];

const CHAVE_TEMA = 'pwa:tema';
const CHAVE_ESCALA = 'pwa:escala';

export function lerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CHAVE_TEMA);
    return guardado === 'claro' || guardado === 'escuro' ? guardado : 'auto';
  } catch {
    return 'auto';
  }
}

export function lerEscala(): Escala {
  try {
    const guardada = ESCALAS.find((e) => e.id === localStorage.getItem(CHAVE_ESCALA));
    return guardada ?? ESCALAS[1];
  } catch {
    return ESCALAS[1];
  }
}

/** Resolve "auto" contra o sistema — é o que o CSS precisa saber. */
export function temaEfetivo(tema: Tema): 'claro' | 'escuro' {
  if (tema !== 'auto') return tema;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTema(tema: Tema): void {
  const efetivo = temaEfetivo(tema);
  document.documentElement.dataset.tema = efetivo;

  // A barra do navegador no Android segue esta meta. Sem atualizá-la, escolher
  // o tema escuro deixava um cabeçalho verde-claro por cima de um app escuro.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', efetivo === 'escuro' ? '#202c33' : '#008069');

  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Navegação privada bloqueia a escrita. A escolha vale para esta visita.
  }
}

export function aplicarEscala(escala: Escala): void {
  document.documentElement.style.setProperty('--escala', String(escala.valor));
  try {
    localStorage.setItem(CHAVE_ESCALA, escala.id);
  } catch {
    // Idem.
  }
}
