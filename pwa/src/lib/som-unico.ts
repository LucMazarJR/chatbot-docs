/**
 * Um som por vez, como no WhatsApp: tocar um áudio para o que estiver tocando.
 *
 * Os sons do chat vêm de lugares diferentes (o tocador de cada balão, a
 * amostra de voz em Letra e voz, a leitura automática pela voz do celular), e
 * cada um parava só os do seu tipo. Dava para ouvir a amostra por cima da
 * resposta, ou duas respostas juntas.
 *
 * A vez é um número, e não só "quem está tocando": a voz natural leva alguns
 * segundos para chegar, e quem tocou em outro áudio nesse meio tempo já tirou
 * a vez dela. Ao chegar, o áudio confere `aindaEAVez` antes de tocar; sem isso,
 * ele começava junto com o novo.
 */
export function criarVez() {
  let atual: { token: number; parar: () => void } | null = null;
  let proximo = 1;

  return {
    /** Toma a vez, parando o som anterior. `parar` é chamado quando outro tomar a vez. */
    tomar(parar: () => void): number {
      const anterior = atual;
      const token = proximo++;
      atual = { token, parar };
      anterior?.parar();
      return token;
    },
    aindaE(token: number): boolean {
      return atual?.token === token;
    },
    /** O som terminou sozinho: ninguém mais precisa pará-lo. */
    soltar(token: number): void {
      if (atual?.token === token) atual = null;
    },
    /** Para o que estiver tocando: gravar e ditar começam em silêncio. */
    pararTudo(): void {
      const anterior = atual;
      atual = null;
      anterior?.parar();
    },
  };
}

const vez = criarVez();

export const tomarAVez = vez.tomar;
export const aindaEAVez = vez.aindaE;
export const soltarAVez = vez.soltar;
export const pararTodoSom = vez.pararTudo;
