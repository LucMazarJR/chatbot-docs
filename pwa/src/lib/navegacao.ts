'use client';

/**
 * O chat do staging já foi aberto nesta visita, por navegação dentro do app.
 *
 * É o que diz se "Voltar para a conversa" pode usar o histórico. Com o chat lá
 * atrás, voltar pelo histórico deixa a pilha limpa; abrir `/staging` por cima
 * empilhava o chat de novo, e o voltar do celular reabria a tela de onde a
 * pessoa tinha acabado de sair. Fica na memória da página, e não no
 * `sessionStorage`: uma página aberta direto (pelo aviso, por um link) não
 * tem o chat no histórico, mesmo que ele tenha sido aberto antes.
 */
let chatNaHistoria = false;

export function marcarChatNaHistoria(): void {
  chatNaHistoria = true;
}

export function podeVoltarAoChat(): boolean {
  return chatNaHistoria && window.history.length > 1;
}
