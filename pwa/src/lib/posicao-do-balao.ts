/**
 * Onde fica a caixa de explicação da demonstração, em relação ao elemento que
 * ela explica.
 *
 * LÓGICA DO LUCIANO: a caixa ficava sempre centralizada na largura da tela.
 * Para o campo de mensagem, que ocupa a largura toda, dava certo; para o botão
 * de enviar e para o menu, que ficam no canto, ela parava longe do que
 * explicava, e quem tem dificuldade não ligava uma coisa à outra. Agora ela
 * fica do lado do elemento que tem mais espaço, alinhada a ele, com uma seta
 * apontando para o centro dele, e nunca por cima do destaque.
 */

export type Caixa = { top: number; left: number; width: number; height: number };

export type PosicaoDoBalao = {
  /** Distância da borda esquerda da tela até a caixa. */
  left: number;
  /** Uma das duas: a caixa abaixo do elemento usa `top`; acima, `bottom`. */
  top?: number;
  bottom?: number;
  /** Altura máxima, para a caixa nunca passar da tela nem cobrir o destaque. */
  maxHeight: number;
  /** Onde a seta fica, medido da borda esquerda da caixa. Nulo sem elemento. */
  setaX: number | null;
  lado: 'acima' | 'abaixo' | 'centro';
};

/** Folga entre a caixa e a borda da tela. */
export const MARGEM = 12;
/** Espaço entre a caixa e o destaque, onde a seta aparece. */
export const DISTANCIA = 14;
/** A seta não encosta no canto arredondado da caixa. */
const SETA_NO_CANTO = 18;

export function posicionarBalao({
  alvo,
  larguraDaTela,
  alturaDaTela,
  larguraDoBalao,
}: {
  alvo: Caixa | null;
  larguraDaTela: number;
  alturaDaTela: number;
  larguraDoBalao: number;
}): PosicaoDoBalao {
  const largura = Math.min(larguraDoBalao, larguraDaTela - MARGEM * 2);
  const centralizado = Math.round((larguraDaTela - largura) / 2);

  if (!alvo) {
    return { left: centralizado, maxHeight: alturaDaTela - MARGEM * 2, setaX: null, lado: 'centro' };
  }

  const espacoAcima = alvo.top - DISTANCIA - MARGEM;
  const espacoAbaixo = alturaDaTela - (alvo.top + alvo.height) - DISTANCIA - MARGEM;
  const acima = espacoAcima >= espacoAbaixo;

  // Centrada no elemento, mas sem sair da tela: no canto, ela encosta na
  // margem e a seta anda até ficar sobre o elemento.
  const centroDoAlvo = alvo.left + alvo.width / 2;
  const left = Math.round(
    Math.min(Math.max(centroDoAlvo - largura / 2, MARGEM), larguraDaTela - MARGEM - largura),
  );
  const setaX = Math.round(Math.min(Math.max(centroDoAlvo - left, SETA_NO_CANTO), largura - SETA_NO_CANTO));

  return acima
    ? { left, bottom: Math.round(alturaDaTela - alvo.top + DISTANCIA), maxHeight: Math.max(espacoAcima, 120), setaX, lado: 'acima' }
    : { left, top: Math.round(alvo.top + alvo.height + DISTANCIA), maxHeight: Math.max(espacoAbaixo, 120), setaX, lado: 'abaixo' };
}
