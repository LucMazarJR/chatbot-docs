/**
 * A sessão guardada no aparelho de quem está conversando.
 *
 * LÓGICA DO LUCIANO: aqui ficava só o id, uma string solta. Agora é um par
 * {id, chave}, e a chave é o que separa "tenho o identificador da conversa" de
 * "sou a pessoa que a está tendo" — o id não serve como segredo, porque volta
 * no corpo das respostas, vai para o n8n e aparece no painel de conversas.
 *
 * Um único lugar monta o cabeçalho, de propósito: são cinco rotas que precisam
 * dele, e uma esquecida significaria a tela quebrar para quem já aceitou os
 * termos — do jeito mais confuso possível, porque só acontece na segunda visita.
 */

const CHAVE_ARMAZENAMENTO = 'pwa:sessao:a';
const CABECALHO_CHAVE = 'x-sessao-chave';

export type SessaoLocal = { id: string; chave?: string };

/**
 * Lê o que está guardado, aceitando o formato antigo.
 *
 * Até aqui o valor era o id cru. Uma sessão daquelas continua abrindo: o
 * servidor não exige chave de quem não tem nenhuma gravada. Sem esta leitura
 * tolerante, quem estava no meio de uma conversa a perderia na atualização.
 */
export function lerSessao(): SessaoLocal | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (!bruto) return null;

    if (!bruto.startsWith('{')) return { id: bruto };

    const dados = JSON.parse(bruto) as SessaoLocal;
    return dados?.id ? dados : null;
  } catch {
    return null;
  }
}

export function guardarSessao(sessao: SessaoLocal): void {
  try {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(sessao));
  } catch {
    // Modo privado, cota cheia. A conversa segue nesta visita; só não é
    // retomada depois — nada que justifique interromper quem está perguntando.
  }
}

export function esquecerSessao(): void {
  try {
    localStorage.removeItem(CHAVE_ARMAZENAMENTO);
  } catch {
    // Ver acima.
  }
}

/** Os cabeçalhos de uma chamada autenticada pela sessão corrente. */
export function cabecalhosDaSessao(extras?: HeadersInit): HeadersInit {
  const sessao = lerSessao();
  const cabecalhos = new Headers(extras);
  if (sessao?.chave) cabecalhos.set(CABECALHO_CHAVE, sessao.chave);
  return cabecalhos;
}
