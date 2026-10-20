/**
 * O voltar do celular fecha a camada aberta (menu, painel, folha), e não o app.
 *
 * Menu, painéis e folhas são estado da tela, e não páginas: sem uma entrada no
 * histórico, o voltar do Android pulava direto para fora do chat, e quem abriu
 * a Letra e voz para aumentar a letra caía na tela inicial do celular.
 *
 * Existe no máximo UMA entrada extra no histórico, enquanto houver qualquer
 * camada aberta, e não uma por camada. Trocar o menu pelo painel (fecha um, abre
 * o outro no mesmo toque) não mexe no histórico; com uma entrada por camada, o
 * `history.back()` do menu correria contra o `pushState` do painel, e a ordem
 * entre os dois muda de navegador para navegador.
 *
 * Lógica pura, com o histórico injetado: o teste roda sem navegador.
 */
export type Historico = {
  /** Põe a entrada extra (`history.pushState`). */
  empilhar: () => void;
  /** Tira a entrada extra (`history.back()`). */
  voltar: () => void;
  /** Onde a página está agora, para saber se a pessoa navegou para outra. */
  endereco: () => string;
  /** Roda depois do resto da troca de camadas (`queueMicrotask`). */
  depois: (tarefa: () => void) => void;
};

export function criarCamadas(historico: Historico) {
  const pilha: { id: number; fechar: () => void }[] = [];
  let proximoId = 1;
  /** A entrada extra existe e é a atual. */
  let armada = false;
  let enderecoDaEntrada = '';
  /** Voltas que nós mesmos pedimos: o `popstate` delas não é a pessoa. */
  let ignorar = 0;

  function armar() {
    historico.empilhar();
    armada = true;
    enderecoDaEntrada = historico.endereco();
  }

  function abrir(fechar: () => void): number {
    const id = proximoId++;
    pilha.push({ id, fechar });
    if (!armada) armar();
    return id;
  }

  /** A camada fechou pela tela (botão, Esc) ou saiu da tela. */
  function soltar(id: number) {
    const indice = pilha.findIndex((camada) => camada.id === id);
    if (indice < 0) return;
    pilha.splice(indice, 1);
    if (pilha.length > 0) return;
    // Depois, e não agora: se outra camada abrir no mesmo toque, ela herda a
    // entrada, e o histórico não se mexe.
    historico.depois(() => {
      if (pilha.length > 0 || !armada) return;
      armada = false;
      // Saiu para outra página: a entrada virou a página nova (o link usa
      // `replace`), e voltar agora desfaria a navegação.
      if (historico.endereco() !== enderecoDaEntrada) return;
      ignorar += 1;
      historico.voltar();
    });
  }

  /** A camada vai sair por um link: a entrada fica para o link substituir. */
  function sair(id: number) {
    const indice = pilha.findIndex((camada) => camada.id === id);
    if (indice < 0) return;
    pilha.splice(indice, 1);
    if (pilha.length === 0) armada = false;
  }

  /** O `popstate`: a pessoa tocou em voltar. */
  function aoVoltar() {
    if (ignorar > 0) {
      ignorar -= 1;
      return;
    }
    if (!armada) return;
    armada = false;
    pilha.pop()?.fechar();
    // Ainda há camada embaixo (o painel, sob a escolha da voz): o próximo
    // voltar precisa de outra entrada para fechá-la.
    if (pilha.length > 0) armar();
  }

  return { abrir, soltar, sair, aoVoltar };
}
