import type { CausaErro } from './tipos';

/**
 * Entrega a pergunta ao fluxo do protótipo no n8n (`/webhook/pwa-chat`).
 *
 * O fluxo responde 200 assim que RECEBE (`responseMode: onReceived`), não
 * quando termina. Esta chamada, portanto, dura milissegundos, mesmo que a
 * resposta ao cidadão leve três minutos para ficar pronta.
 *
 * Foi assim que o teto de tempo deixou de existir. Antes o fluxo só respondia no
 * fim, e a requisição ficava aberta o tempo todo — na Vercel a plataforma matava
 * a função aos 60s e a resposta se perdia mesmo tendo sido gerada. Agora o n8n
 * trabalha sozinho e devolve o resultado pelo retorno em
 * `/api/n8n/resposta`, que grava na mensagem pendente.
 *
 * É o mesmo desenho que o canal do WhatsApp usa entre o gateway e o n8n.
 */

/**
 * Quanto esperamos apenas pelo ACEITE da pergunta.
 *
 * Não tem relação com o tempo de processamento: se o n8n não confirma o
 * recebimento em 15s, ele não está no ar.
 */
const TEMPO_LIMITE_ENTREGA = 15_000;

type Entrega = {
  sessaoId: string;
  mensagemId: string;
  texto: string;
  nome: string;
  correlationId: string;
  /** Para onde o n8n deve devolver a resposta quando terminar. */
  urlDeRetorno: string;
};

export type ResultadoDaEntrega =
  | { aceito: true }
  | { aceito: false; motivo: string; causa: CausaErro };

export async function despachar({
  sessaoId,
  mensagemId,
  texto,
  nome,
  correlationId,
  urlDeRetorno,
}: Entrega): Promise<ResultadoDaEntrega> {
  const url = process.env.N8N_PWA_WEBHOOK_URL;
  const token = process.env.N8N_PWA_WEBHOOK_TOKEN;

  if (!url || !token) {
    console.error('N8N_PWA_WEBHOOK_URL ou N8N_PWA_WEBHOOK_TOKEN não definidos');
    return { aceito: false, motivo: 'configuração ausente', causa: 'fora-do-ar' };
  }

  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Validado pela credencial Header Auth "PWA Webhook Token" do fluxo.
        'X-Webhook-Token': token,
        'X-Correlation-Id': correlationId,
      },
      body: JSON.stringify({ sessionId: sessaoId, mensagemId, texto, nome, urlDeRetorno }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_ENTREGA),
      cache: 'no-store',
    });

    if (!resposta.ok) {
      // Nunca logar o corpo: pode conter a pergunta do participante, e o
      // conteúdo só deve existir no banco do protótipo.
      console.error('n8n recusou a pergunta', { status: resposta.status, correlationId });
      return {
        aceito: false,
        motivo: `HTTP ${resposta.status}`,
        causa: classificarStatus(resposta.status),
      };
    }

    return { aceito: true };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'erro desconhecido';
    console.error('falha ao entregar a pergunta ao n8n', { motivo, correlationId });

    // Falhar aqui significa que nem houve conversa: a máquina do n8n está
    // desligada, o túnel caiu, o nome não resolve. Nada disso melhora tentando
    // de novo daqui a pouco.
    return { aceito: false, motivo, causa: 'fora-do-ar' };
  }
}

/**
 * Traduz o status HTTP na categoria que a tela sabe explicar.
 *
 * A divisão não é por família de código, é por "o que adianta fazer agora":
 * 401/403/404 e 502/503 pedem alguém consertando do outro lado, e mandar o
 * participante tentar de novo seria enganá-lo.
 */
function classificarStatus(status: number): CausaErro {
  if ([408, 504, 524].includes(status)) return 'demora';
  if ([401, 403, 404, 502, 503].includes(status)) return 'fora-do-ar';
  return 'indisponivel';
}

/**
 * A URL pública deste protótipo, para o n8n saber para onde devolver.
 *
 * Vai no corpo da requisição, e não numa variável do n8n, porque as duas
 * hospedagens convivem: rodando em Docker o retorno é `http://pwa:8080`, na
 * Vercel é o domínio dela. Deixando cada requisição dizer de onde veio, o mesmo
 * fluxo atende as duas sem configuração dupla.
 */
export function urlDeRetorno(requisicao: Request): string {
  const configurada = process.env.PWA_PUBLIC_URL;
  if (configurada) return `${configurada.replace(/\/$/, '')}/api/n8n/resposta`;

  const cabecalhos = requisicao.headers;
  const host = cabecalhos.get('x-forwarded-host') ?? cabecalhos.get('host');
  const protocolo = cabecalhos.get('x-forwarded-proto') ?? 'http';

  return `${protocolo}://${host}/api/n8n/resposta`;
}
