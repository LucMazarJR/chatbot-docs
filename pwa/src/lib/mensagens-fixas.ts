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

/**
 * Avisos sobre a espera, em duas etapas.
 *
 * Os tempos vêm do uso real, não de chute: a resposta leva cerca de 30s em
 * média e há casos chegando perto de 3 minutos, quando o Gemini devolve
 * sobrecarga e o agente repete a pergunta. Por isso o primeiro aviso só aparece
 * aos 20s — antes disso ele interromperia uma espera que é normal — e o segundo
 * aos 60s, quando a conversa já saiu de qualquer expectativa razoável.
 *
 * Nenhum dos dois expõe detalhe interno: dizem só o que muda o que a pessoa faz
 * em seguida, que é continuar esperando.
 */
export const AVISOS_DE_DEMORA = [
  {
    ms: 20_000,
    texto:
      'Ainda estou procurando essa informação. 🔎 Às vezes a busca leva um pouco mais, ' +
      'pode aguardar.',
  },
  {
    ms: 60_000,
    texto:
      'Continuo trabalhando na sua pergunta. ⏳ Hoje o sistema está mais lento que o ' +
      'normal — não precisa reenviar, é só aguardar mais um pouco.',
  },
] as const;

export const TEXTO_DEMOROU_DEMAIS =
  'Demorei demais para responder desta vez e acabei não conseguindo concluir. 😕 ' +
  'Pode tentar perguntar de novo? Se for uma emergência, procure atendimento médico ' +
  'imediato ou ligue 192.';

/**
 * A partir de quanto tempo uma falha de rede é tratada como demora.
 *
 * Abaixo disso, a requisição nem chegou a esperar de verdade: é o servidor que
 * não respondeu, e a mensagem certa é a de serviço fora do ar.
 */
export const MS_PARA_CONSIDERAR_DEMORA = 20_000;

/**
 * O serviço não está no ar.
 *
 * Caso típico: o Docker da máquina que hospeda o n8n está desligado. Aqui
 * "tente novamente em alguns minutos" seria mentira — nada muda até alguém
 * religar. Dizer isso, e dizer que não é problema da conexão de quem está
 * lendo, evita que a pessoa fique tentando e conclua que o celular dela é que
 * está ruim.
 */
export const TEXTO_FORA_DO_AR =
  'O assistente está temporariamente fora do ar. 🔌 Fique tranquilo, não é nada com o ' +
  'seu celular nem com a sua internet. Por favor, avise a pessoa responsável pelo teste ' +
  'para que o serviço seja religado.';

/**
 * Resposta a arquivo ou áudio.
 *
 * O canal real só processa texto, e esta é a recusa que ele daria. Diz o que
 * fazer em seguida em vez de só recusar: quem mandou foto do exame precisa saber
 * que pode digitar a dúvida, senão desiste ali.
 */
export const TEXTO_SOMENTE_TEXTO =
  'Recebi seu envio, mas por enquanto só consigo ler mensagens de texto. 📝 Pode me ' +
  'escrever a sua dúvida? Se for sobre um exame ou receita, me conte o que está escrito ' +
  'que eu ajudo.';
