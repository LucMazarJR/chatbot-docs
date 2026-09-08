/**
 * Chamada ao fluxo do protótipo no n8n (`/webhook/pwa-chat`).
 *
 * Diferença central em relação ao canal do WhatsApp: lá o n8n devolve 200 na
 * hora e a resposta chega depois, pelo gateway. Aqui o fluxo usa
 * `responseMode: responseNode` e a resposta volta na MESMA requisição — o
 * participante está com a tela aberta esperando.
 *
 * Por isso o timeout é generoso (45s por padrão): uma mensagem faz embedding +
 * busca vetorial no Atlas + chamada ao Gemini, e o AI Agent ainda tenta 3 vezes
 * com 3s de intervalo quando o modelo devolve sobrecarga.
 */

const TEXTO_INDISPONIVEL =
  'Não consegui responder agora. 😕 Por favor, tente novamente em alguns minutos. ' +
  'Se for uma emergência, procure atendimento médico imediato ou ligue 192.';

export async function perguntar({ sessaoId, mensagemId, texto, nome, correlationId }, log) {
  const url = process.env.N8N_PWA_WEBHOOK_URL;
  const token = process.env.N8N_PWA_WEBHOOK_TOKEN;
  const timeoutMs = Number(process.env.PWA_N8N_TIMEOUT_MS || 45000);

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
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latenciaMs = Date.now() - iniciouEm;

    if (!resposta.ok) {
      // Nunca logar o corpo: pode conter a pergunta do participante, e o
      // conteúdo só deve existir no banco do protótipo.
      log?.error({ status: resposta.status, latenciaMs, correlationId }, 'n8n recusou a requisição');
      return falha(latenciaMs, `HTTP ${resposta.status}`);
    }

    const corpo = await resposta.json();

    // O nó de erro do fluxo responde 200 com `ok: false` — é uma falha do
    // agente, não do transporte, e vem com os metadados da busca preenchidos.
    if (corpo?.ok === false) {
      log?.warn({ latenciaMs, correlationId }, 'fluxo respondeu com indisponibilidade');
    }

    return {
      ok: corpo?.ok !== false,
      resposta: corpo?.resposta || TEXTO_INDISPONIVEL,
      temContexto: corpo?.temContexto ?? null,
      qtdTrechos: corpo?.qtdTrechos ?? null,
      trechosDebug: Array.isArray(corpo?.trechosDebug) ? corpo.trechosDebug : [],
      limiarScore: corpo?.limiarScore ?? null,
      modelo: corpo?.modelo ?? null,
      latenciaMs,
    };
  } catch (erro) {
    const latenciaMs = Date.now() - iniciouEm;
    const motivo = erro?.name === 'TimeoutError' ? `timeout de ${timeoutMs}ms` : erro?.message;
    log?.error({ motivo, latenciaMs, correlationId }, 'falha ao chamar o n8n');
    return falha(latenciaMs, motivo);
  }
}

/**
 * Falha devolve o MESMO texto que o cidadão veria no WhatsApp. O protótipo
 * existe para medir a experiência real: inventar aqui uma mensagem de erro
 * mais bonita esconderia justamente o que precisa ser avaliado.
 */
function falha(latenciaMs, motivo) {
  return {
    ok: false,
    erro: true,
    motivo,
    resposta: TEXTO_INDISPONIVEL,
    temContexto: null,
    qtdTrechos: null,
    trechosDebug: [],
    limiarScore: null,
    modelo: null,
    latenciaMs,
  };
}
