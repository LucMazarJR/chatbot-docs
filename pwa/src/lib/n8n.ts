import { TEXTO_INDISPONIVEL } from './mensagens-fixas';
import type { CausaErro, RespostaFluxo, TrechoDebug } from './tipos';

/**
 * Quanto esperamos pelo fluxo antes de desistir.
 *
 * No uso real a resposta leva cerca de 30s, e há casos chegando perto de 3
 * minutos — o AI Agent repete a pergunta até 3 vezes quando o Gemini devolve
 * sobrecarga. Daí os 170s: cabe o pior caso observado.
 *
 * ATENÇÃO: este valor só manda de verdade quando o protótipo roda em Docker. Na
 * Vercel quem corta primeiro é a plataforma, que mata a função aos 60s
 * (`maxDuration`, teto do plano Hobby) e devolve um 504 — a mensagem explicando
 * a demora nem chega a ser escrita aqui, e quem trata o caso é a tela, pelo
 * tempo decorrido. Uma resposta de 3 minutos NÃO cabe numa requisição só na
 * Vercel; para isso seria preciso o plano Pro (300s) ou trocar a espera
 * síncrona por retorno assíncrono, como o canal do WhatsApp já faz.
 */
const TEMPO_LIMITE_PADRAO = 170_000;

/**
 * Chamada ao fluxo do protótipo no n8n (`/webhook/pwa-chat`).
 *
 * Diferença central em relação ao canal do WhatsApp: lá o n8n devolve 200 na
 * hora e a resposta chega depois, pelo gateway. Aqui o fluxo usa
 * `responseMode: responseNode` e a resposta volta na MESMA requisição — o
 * participante está com a tela aberta esperando.
 *
 * Por isso o tempo limite é generoso (45s por padrão): uma mensagem faz
 * embedding + busca vetorial no Atlas + chamada ao Gemini, e o AI Agent ainda
 * tenta 3 vezes com 3s de intervalo quando o modelo devolve sobrecarga.
 */

type Pergunta = {
  sessaoId: string;
  mensagemId: string;
  texto: string;
  nome: string;
  correlationId: string;
};

export async function perguntar({
  sessaoId,
  mensagemId,
  texto,
  nome,
  correlationId,
}: Pergunta): Promise<RespostaFluxo> {
  const url = process.env.N8N_PWA_WEBHOOK_URL;
  const token = process.env.N8N_PWA_WEBHOOK_TOKEN;
  const tempoLimite = Number(process.env.PWA_N8N_TIMEOUT_MS || TEMPO_LIMITE_PADRAO);

  if (!url || !token) {
    console.error('N8N_PWA_WEBHOOK_URL ou N8N_PWA_WEBHOOK_TOKEN não definidos');
    return falha(0, 'configuração ausente', 'fora-do-ar');
  }

  const iniciouEm = Date.now();

  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Validado pela credencial Header Auth "PWA Webhook Token" do fluxo.
        // É um token PRÓPRIO: rotacionar o do WhatsApp não derruba o protótipo,
        // e vice-versa.
        'X-Webhook-Token': token,
        'X-Correlation-Id': correlationId,
      },
      body: JSON.stringify({ sessionId: sessaoId, mensagemId, texto, nome }),
      signal: AbortSignal.timeout(tempoLimite),
      cache: 'no-store',
    });

    const latenciaMs = Date.now() - iniciouEm;

    if (!resposta.ok) {
      // Nunca logar o corpo: pode conter a pergunta do participante, e o
      // conteúdo só deve existir no banco do protótipo.
      console.error('n8n recusou a requisição', {
        status: resposta.status,
        latenciaMs,
        correlationId,
      });
      return falha(latenciaMs, `HTTP ${resposta.status}`, classificarStatus(resposta.status));
    }

    const corpo = (await resposta.json()) as Partial<RespostaFluxo>;

    // O nó de erro do fluxo responde 200 com `ok: false` — é uma falha do
    // agente, não do transporte, e vem com os metadados da busca preenchidos.
    if (corpo?.ok === false) {
      console.warn('fluxo respondeu com indisponibilidade', { latenciaMs, correlationId });
    }

    return {
      ok: corpo?.ok !== false,
      erro: corpo?.ok === false,
      // O nó de erro do fluxo dispara quando o agente esgotou as tentativas
      // contra a sobrecarga do Gemini — do ponto de vista de quem espera, é o
      // mesmo caso da demora.
      causa: corpo?.ok === false ? 'demora' : undefined,
      resposta: corpo?.resposta || TEXTO_INDISPONIVEL,
      temContexto: corpo?.temContexto ?? null,
      qtdTrechos: corpo?.qtdTrechos ?? null,
      trechosDebug: Array.isArray(corpo?.trechosDebug) ? (corpo.trechosDebug as TrechoDebug[]) : [],
      limiarScore: corpo?.limiarScore ?? null,
      modelo: corpo?.modelo ?? null,
      latenciaMs,
    };
  } catch (erro) {
    const latenciaMs = Date.now() - iniciouEm;
    const estourouOTempo = erro instanceof Error && erro.name === 'TimeoutError';

    const motivo = estourouOTempo
      ? `tempo limite de ${tempoLimite}ms`
      : erro instanceof Error
        ? erro.message
        : 'erro desconhecido';

    console.error('falha ao chamar o n8n', { motivo, latenciaMs, correlationId });

    // `fetch` lançar sem ser por tempo significa que nem houve conversa: a
    // máquina do n8n está desligada, o túnel caiu, o nome não resolve. Nada
    // disso melhora tentando de novo.
    return falha(latenciaMs, motivo, estourouOTempo ? 'demora' : 'fora-do-ar');
  }
}

/**
 * Traduz o status HTTP na categoria que a tela sabe explicar.
 *
 * A divisão não é por família de código, é por "o que adianta fazer agora":
 * demora pede outra tentativa; 401/403/404 e 502/503 pedem alguém consertando
 * do outro lado, e mandar o participante tentar de novo seria enganá-lo.
 */
function classificarStatus(status: number): CausaErro {
  if ([408, 504, 524].includes(status)) return 'demora';
  if ([401, 403, 404, 502, 503].includes(status)) return 'fora-do-ar';
  return 'indisponivel';
}

/**
 * Falha devolve o MESMO texto que o cidadão veria no WhatsApp. O protótipo
 * existe para medir a experiência real: inventar aqui uma mensagem de erro mais
 * bonita esconderia justamente o que precisa ser avaliado.
 */
function falha(latenciaMs: number, motivo: string, causa: CausaErro): RespostaFluxo {
  return {
    ok: false,
    erro: true,
    motivo,
    causa,
    resposta: TEXTO_INDISPONIVEL,
    temContexto: null,
    qtdTrechos: null,
    trechosDebug: [],
    limiarScore: null,
    modelo: null,
    latenciaMs,
  };
}
