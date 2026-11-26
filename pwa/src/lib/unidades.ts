/** Uma unidade de saúde da lista que a equipe mantém no painel. */
export type Unidade = { id: string; nome: string };

/** Quantas sugestões cabem acima do campo com o teclado aberto, num celular de 390px. */
export const MAXIMO_DE_SUGESTOES = 6;

/**
 * O que não ajuda a achar a unidade na hora de digitar.
 *
 * Mais curta que a lista do painel (`identificar-ubs.ts`), de propósito: lá a
 * chave serve para dizer que dois textos são a MESMA unidade, e "centro" ou
 * "jardim" atrapalham. Aqui serve para filtrar enquanto a pessoa escreve, e
 * quem digita "jardim" quer ver as unidades de jardim.
 */
const PALAVRAS_DE_FILTRO_IGNORADAS = new Set([
  'ubs', 'ubsf', 'esf', 'usf', 'psf', 'unidade', 'posto', 'saude', 'basica', 'de', 'do', 'da', 'dos', 'das', 'e',
]);

/**
 * As palavras que distinguem uma unidade, como o painel as compara.
 *
 * Cópia de `chaveDeUbs` (Dashboard-PetSaude/back/src/ubs/identificar-ubs.ts):
 * o PWA e o painel são builds separados, sem pacote em comum. Mudou lá, muda
 * aqui, senão a escolha automática e o reconhecimento do painel discordam.
 */
const PALAVRAS_DA_CHAVE_IGNORADAS = new Set([
  'ubs', 'ubsf', 'esf', 'usf', 'psf', 'unidade', 'basica', 'saude', 'posto', 'centro',
  'estrategia', 'familia', 'bairro', 'jardim', 'jd', 'vila', 'vl', 'parque', 'pq',
  'franca', 'sp', 'de', 'do', 'da', 'dos', 'das', 'e',
]);

const SINONIMOS: Record<string, string> = {
  '1': 'i', um: 'i',
  '2': 'ii', dois: 'ii',
  '3': 'iii', tres: 'iii',
  '4': 'iv', quatro: 'iv',
  sta: 'santa',
  sto: 'santo',
};

function palavras(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((palavra) => SINONIMOS[palavra] ?? palavra);
}

/** A chave do painel: duas grafias com a mesma chave são a mesma unidade. */
export function chaveDeUnidade(texto: string): string {
  return palavras(texto)
    .filter((p) => !PALAVRAS_DA_CHAVE_IGNORADAS.has(p))
    .join(' ');
}

/** As palavras que a pessoa digitou e que servem para filtrar. */
function termos(texto: string): string[] {
  return palavras(texto).filter((p) => !PALAVRAS_DE_FILTRO_IGNORADAS.has(p));
}

/**
 * As unidades que combinam com o que a pessoa digitou até agora.
 *
 * Cada palavra digitada precisa ser o começo de alguma palavra do nome, em
 * qualquer ordem: "terez sta" acha "UBS Santa Terezinha". Sem acento e sem
 * maiúscula, porque é assim que se digita no celular. Campo vazio devolve a
 * lista inteira, em ordem alfabética: quem não sabe escrever o nome ainda
 * consegue achar rolando.
 */
export function filtrarUnidades(lista: Unidade[], digitado: string, maximo = Infinity): Unidade[] {
  const busca = termos(digitado);
  const ordenadas = [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (busca.length === 0) return digitado.trim() ? [] : ordenadas.slice(0, maximo);

  const combina = ordenadas.filter((u) => {
    const doNome = palavras(u.nome);
    return busca.every((termo) => doNome.some((p) => p.startsWith(termo)));
  });

  // Quem bate pelo começo do nome vem antes: digitar "a" mostra Aeroporto antes
  // de Santa Ana.
  const primeiro = busca[0];
  const pontos = (u: Unidade) => (termos(u.nome)[0]?.startsWith(primeiro) ? 0 : 1);
  return combina.sort((a, b) => pontos(a) - pontos(b)).slice(0, maximo);
}

/**
 * A unidade que o texto enviado sem escolher na lista claramente quer dizer, ou null.
 *
 * Só decide quando não há dúvida: a mesma chave do painel, ou uma única unidade
 * combinando com pelo menos quatro letras digitadas. Com dúvida, o texto vai
 * como "outra unidade" e a equipe identifica no painel: escolher errado aqui
 * gravaria a conversa na unidade errada sem ninguém ver.
 */
export function unidadeSemDuvida(lista: Unidade[], digitado: string): Unidade | null {
  const chave = chaveDeUnidade(digitado);
  if (chave) {
    const mesmaChave = lista.filter((u) => chaveDeUnidade(u.nome) === chave);
    if (mesmaChave.length === 1) return mesmaChave[0];
  }
  if (termos(digitado).join('').length < 4) return null;
  const combinam = filtrarUnidades(lista, digitado);
  return combinam.length === 1 ? combinam[0] : null;
}
