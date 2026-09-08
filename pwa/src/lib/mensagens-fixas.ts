/**
 * Textos que precisam ser idênticos aos do canal real.
 *
 * Ficam separados porque são usados dos dois lados: pelo servidor, quando o
 * fluxo falha, e pelo componente do chat, quando a própria requisição ao
 * servidor falha. O módulo do n8n não serve para isso — ele lê variáveis de
 * ambiente e nunca deve ser importado por um componente de cliente.
 */

/**
 * Cópia literal do texto do nó "Enviar aviso de indisponibilidade" do fluxo do
 * WhatsApp. O protótipo existe para medir a experiência real: inventar aqui uma
 * mensagem de erro mais bonita esconderia justamente o que precisa ser avaliado.
 */
export const TEXTO_INDISPONIVEL =
  'Não consegui responder agora. 😕 Por favor, tente novamente em alguns minutos. ' +
  'Se for uma emergência, procure atendimento médico imediato ou ligue 192.';
