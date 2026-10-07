// Executa as perguntas de uma conversa num fluxo, turno a turno, fora do n8n.
//
// O formato do fluxo é reconhecido pelos nós que ele tem:
//   direto     o `/`: busca com a frase da pessoa, contexto, agente;
//   reescrita  o staging: reescrita, uma busca por consulta, contexto, agente.
// Tudo que muda o resultado (prompt, código dos nós, topK, modelos, prazo da
// reescrita, janela da memória) é lido do arquivo do fluxo.
//
// O agente é reproduzido como o nó do n8n o chama: o system prompt do nó, a
// memória do Redis (a entrada inteira de cada turno, com os trechos, e a
// resposta, na janela de `contextWindowLength` trocas) e as opções do modelo
// como estão no nó. Opções vazias querem dizer temperatura padrão do modelo,
// e o teste mantém isso para medir o que as pessoas recebem.
import { avaliarExpressao, modeloDoNo } from './fluxo.mjs';
import { buscarVetorial, itemDoN8n, resumoDoResultado } from './busca.mjs';
import { CotaEsgotada, textoDaResposta } from './gemini.mjs';

export function criarExecutor({ fluxo, triagem, analise, banco, cache }) {
  const formato = fluxo.tem('Montar reescrita') ? 'reescrita' : 'direto';

  const modeloEmbedding = modeloDoNo(fluxo.no('Embeddings Google Gemini'));
  const topK = Number(fluxo.no('Buscar FAQs').parameters.topK);
  const agente = fluxo.no('AI Agent');
  const systemMessage = agente.parameters.options?.systemMessage ?? '';
  const opcoesDoModelo = fluxo.no('Google Gemini Chat Model').parameters.options ?? {};
  const janela = Number(fluxo.no('Redis Chat Memory').parameters.contextWindowLength);

  // A ordem em que o fluxo tenta os modelos: o principal, a reserva do próprio
  // agente e o agente de última reserva.
  const modelos = [
    modeloDoNo(fluxo.no('Google Gemini Chat Model')),
    ...(agente.parameters.needsFallback && fluxo.tem('Gemini reserva') ? [modeloDoNo(fluxo.no('Gemini reserva'))] : []),
    ...(fluxo.tem('Gemini última reserva') ? [modeloDoNo(fluxo.no('Gemini última reserva'))] : []),
  ];

  const geracao = {};
  if (typeof opcoesDoModelo.temperature === 'number') geracao.temperature = opcoesDoModelo.temperature;
  if (typeof opcoesDoModelo.maxOutputTokens === 'number') geracao.maxOutputTokens = opcoesDoModelo.maxOutputTokens;

  async function buscar(texto) {
    const emb = await cache.ou('embedding', { modelo: modeloEmbedding, texto }, async () => {
      const { vetor, ms } = await triagem.embedding(modeloEmbedding, texto);
      return { vetor, ms };
    });
    const inicio = Date.now();
    const docs = await buscarVetorial(banco.faqs, emb.vetor, { topK });
    return { docs, msEmbedding: emb.ms, msBusca: Date.now() - inicio, chamadas: emb.doCache ? 0 : 1 };
  }

  async function responder(entrada, memoria) {
    const corpo = {
      systemInstruction: { parts: [{ text: systemMessage }] },
      contents: [
        ...memoria.slice(-janela * 2).map((m) => ({ role: m.papel === 'user' ? 'user' : 'model', parts: [{ text: m.texto }] })),
        { role: 'user', parts: [{ text: entrada }] },
      ],
      ...(Object.keys(geracao).length ? { generationConfig: geracao } : {}),
    };
    const falhas = [];
    let chamadas = 0;
    for (const modelo of modelos) {
      try {
        const r = await cache.ou('agente', { modelo, corpo }, async () => {
          chamadas++;
          const { dados, ms } = await analise.gerar(modelo, corpo);
          return { texto: textoDaResposta(dados), ms };
        });
        if (r.texto.trim()) return { texto: r.texto, modelo, ms: r.ms, falhas, chamadas };
        falhas.push(`${modelo}: resposta vazia`);
      } catch (erro) {
        // Cota do dia é problema do teste, não do fluxo: interrompe a rodada.
        if (erro instanceof CotaEsgotada) throw erro;
        falhas.push(erro.message);
      }
    }
    return { texto: null, modelo: null, ms: 0, falhas, chamadas };
  }

  async function reescrever(dados) {
    const [montado] = fluxo.rodarCodigo('Montar reescrita', { nos: { Dados: dados } });
    const no = fluxo.no('Reescrever pergunta');
    const modelo = /models\/([^:/]+):/.exec(no.parameters.url)[1];
    // O nó tem prazo e repete a tentativa quando ele estoura; depois disso
    // segue pela saída normal com o erro, e o "Consultas" usa o texto original.
    const prazoMs = Number(no.parameters.options?.timeout) || 300_000;
    const tentativasPorPrazo = no.retryOnFail ? Number(no.maxTries) || 3 : 1;
    const esperaPorPrazoMs = Number(no.waitBetweenTries) || 1000;
    let resposta;
    let ms = 0;
    let falhou = null;
    let chamadas = 0;
    try {
      const r = await cache.ou('reescrita', { modelo, corpo: montado.json.corpo }, async () => {
        chamadas++;
        const { dados: d, ms: duracao } = await triagem.gerar(modelo, montado.json.corpo, { prazoMs, tentativasPorPrazo, esperaPorPrazoMs });
        return { dados: d, ms: duracao };
      });
      resposta = r.dados;
      ms = r.ms;
    } catch (erro) {
      if (erro instanceof CotaEsgotada) throw erro;
      resposta = { error: { message: erro.message } };
      falhou = erro.message;
    }
    const itens = fluxo.rodarCodigo('Consultas', { nos: { 'Montar reescrita': montado.json }, entrada: [{ json: resposta }] });
    return { itens, ms, falhou, chamadas };
  }

  /**
   * Um turno da conversa. `estado` guarda a memória do agente e o histórico
   * que o PWA mandaria ao staging, e é atualizado aqui. Com `soBusca`, o
   * turno para no contexto: serve para medir a busca sem gastar a cota da
   * análise.
   */
  async function turno(estado, texto, { soBusca = false } = {}) {
    const dados = {
      IdChat: `pwa:${estado.id}`,
      TextoMensagem: texto,
      NomeUser: '',
      EventId: '',
      CorrelationId: '',
      UrlDeRetorno: '',
      // O PWA manda as 4 últimas mensagens da conversa, sem a pergunta nova.
      Historico: JSON.stringify(estado.historico.slice(-4)),
    };
    const tempos = { triagem: 0, embedding: 0, busca: 0, analise: 0 };
    const chamadas = { triagem: 0, embedding: 0, analise: 0 };
    const buscas = [];
    let triagemFeita = null;
    let contexto;

    if (formato === 'direto') {
      const b = await buscar(texto);
      buscas.push({ consulta: texto, resultados: b.docs.map(resumoDoResultado) });
      tempos.embedding += b.msEmbedding;
      tempos.busca += b.msBusca;
      chamadas.embedding += b.chamadas;
      [contexto] = fluxo.rodarCodigo('Montar contexto', { nos: { Dados: dados }, entrada: b.docs.map((d) => itemDoN8n(d, 0)) });
    } else {
      const r = await reescrever(dados);
      tempos.triagem = r.ms;
      chamadas.triagem = r.chamadas;
      const base = r.itens[0].json;
      triagemFeita = { tipo: base.Tipo, perguntaCompleta: base.PerguntaCompleta, consultas: base.Consultas, falhou: r.falhou };
      let entrada = r.itens;
      if (!base.PularBusca) {
        entrada = [];
        for (const [i, item] of r.itens.entries()) {
          const b = await buscar(item.json.TextoBusca);
          buscas.push({ consulta: item.json.TextoBusca, resultados: b.docs.map(resumoDoResultado) });
          tempos.embedding += b.msEmbedding;
          tempos.busca += b.msBusca;
          chamadas.embedding += b.chamadas;
          entrada.push(...b.docs.map((d) => itemDoN8n(d, i)));
        }
      }
      [contexto] = fluxo.rodarCodigo('Montar contexto', { nos: { Consultas: base }, entrada });
    }

    const entradaDoAgente = avaliarExpressao(agente.parameters.text, contexto.json);
    const resposta = soBusca
      ? { texto: null, modelo: null, ms: 0, falhas: [], chamadas: 0 }
      : await responder(entradaDoAgente, estado.memoria);
    tempos.analise = resposta.ms;
    chamadas.analise = resposta.chamadas;

    // A memória do Redis só guarda o turno que o agente completou.
    if (resposta.texto) estado.memoria.push({ papel: 'user', texto: entradaDoAgente }, { papel: 'bot', texto: resposta.texto });
    estado.historico.push({ papel: 'user', texto }, ...(resposta.texto ? [{ papel: 'bot', texto: resposta.texto }] : []));

    const trechos = contexto.json.TrechosDebug ?? [];
    return {
      soBusca,
      resposta: resposta.texto,
      modelo: resposta.modelo,
      falhas: resposta.falhas,
      triagem: triagemFeita,
      buscas,
      trechos,
      usados: trechos.filter((t) => t.usado).map((t) => t.faqId),
      tempos,
      chamadas,
    };
  }

  return {
    formato,
    referencia: fluxo.referencia,
    novoEstado: (id) => ({ id, memoria: [], historico: [] }),
    turno,
  };
}
