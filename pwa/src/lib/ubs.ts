/** O maior nome de unidade cabe com folga: o campo é livre, e o banco não é depósito. */
export const LIMITE_UBS = 60;

const MAXIMO_DE_PALAVRAS = 6;

/** Como costuma começar uma pergunta escrita sem o ponto de interrogação. */
const COMECO_DE_PERGUNTA =
  /^(como|qual|quais|quando|onde|quanto|quantos|quantas|quem|porque|por que|o que|posso|pode|tenho|preciso|quero|gostaria|tem|existe|e se)\b/i;

/**
 * A resposta à pergunta "em qual UBS você está?" parece mesmo um nome de unidade?
 *
 * LÓGICA DO LUCIANO: a pergunta aparece logo depois do aceite, e quem já chega
 * com a dúvida pronta escreve a dúvida. Tratar tudo como nome faria o chat
 * responder "pronto, já pode perguntar" a quem acabou de perguntar, e guardaria
 * um relato de saúde num campo que vai para a lista de grafias do painel. O que
 * não parece nome segue para o assistente como pergunta normal.
 *
 * Cinco dígitos, mesmo separados por ponto ou espaço, não são nome de unidade:
 * costumam ser CPF, cartão do SUS ou telefone, justamente o que o aceite pede
 * para não informar.
 *
 * O erro de digitação não é decidido aqui: o texto é guardado como veio, e quem
 * reconhece a unidade é o painel, para uma correção valer também para trás.
 */
export function pareceNomeDeUbs(texto: string): boolean {
  const limpo = texto.trim();
  if (limpo.length < 2 || limpo.length > LIMITE_UBS) return false;
  if (limpo.includes('?') || limpo.replace(/\D/g, '').length >= 5) return false;
  if (COMECO_DE_PERGUNTA.test(limpo)) return false;
  return limpo.split(/\s+/).length <= MAXIMO_DE_PALAVRAS;
}
