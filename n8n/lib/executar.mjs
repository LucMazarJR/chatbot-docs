// Executa as perguntas de uma conversa num fluxo, turno a turno, fora do n8n.
//
// O fluxo é reconhecido pelos nós que ele tem, em duas metades:
//   preparo   direto    (o `/`: busca com a frase da pessoa)
//             reescrita (reescrita e uma busca por consulta)
//             triagem   (a pergunta separada em partes, buscas por parte)
//   resposta  agente    (o AI Agent do n8n, com a memória do Redis)
//             análise   (chamada direta ao Gemini, com resultado em JSON)
// Tudo que muda o resultado (prompt, código dos nós, topK, modelos, prazos,
// janela da memória) é lido do arquivo do fluxo.
//
// O agente é reproduzido como o nó do n8n o chama: o system prompt do nó, a
// memória do Redis (a entrada inteira de cada turno, com os trechos, e a
// resposta, na janela de `contextWindowLength` trocas) e as opções do modelo
// como estão no nó. Opções vazias querem dizer temperatura padrão do modelo,
// e o teste mantém isso para medir o que as pessoas recebem.
import { avaliarExpressao, modeloDoNo } from './fluxo.mjs';
import { buscarVetorial, itemDoN8n, resumoDoResultado } from './busca.mjs';
import { CotaEsgotada, textoDaResposta } from './gemini.mjs';

const NOS_DO_PREPARO = {
  reescrita: { montar: 'Montar reescrita', chamar: 'Reescrever pergunta', etapa: 'reescrita' },
  triagem: { montar: 'Montar triagem', chamar: 'Triar pergunta', etapa: 'triagem' },
};
const CADEIA_DA_ANALISE = ['Analisar', 'Analisar (reserva)', 'Analisar (última reserva)'];

export function criarExecutor({ fluxo, triagem, analise, banco, cache }) {
  const preparo = fluxo.tem('Montar triagem') ? 'triagem' : fluxo.tem('Montar reescrita') ? 'reescrita' : 'direto';
  const comAnalise = fluxo.tem('Montar análise');
  const formato = comAnalise ? `${preparo} e análise` : preparo;

  const modeloEmbedding = modeloDoNo(fluxo.no('Embeddings Google Gemini'));
  const topK = Number(fluxo.no('Buscar FAQs').parameters.topK);

  // O agente só existe nos fluxos sem análise.
  let agente = null;
  if (!comAnalise) {
    const no = fluxo.no('AI Agent');
    const opcoesDoModelo = fluxo.no('Google Gemini Chat Model').parameters.options ?? {};
    const geracao = {};
    if (typeof opcoesDoModelo.temperature === 'number') geracao.temperature = opcoesDoModelo.temperature;
    if (typeof opcoesDoModelo.maxOutputTokens === 'number') geracao.maxOutputTokens = opcoesDoModelo.maxOutputTokens;
    agente = {
      texto: no.parameters.text,
      systemMessage: no.parameters.options?.systemMessage ?? '',
      geracao,
      janela: Number(fluxo.no('Redis Chat Memory').parameters.contextWindowLength),
      // A ordem em que o fluxo tenta os modelos: o principal, a reserva do
      // próprio agente e o agente de última reserva.
      modelos: [
        modeloDoNo(fluxo.no('Google Gemini Chat Model')),
        ...(no.parameters.needsFallback && fluxo.tem('Gemini reserva') ? [modeloDoNo(fluxo.no('Gemini reserva'))] : []),
        ...(fluxo.tem('Gemini última reserva') ? [modeloDoNo(fluxo.no('Gemini última reserva'))] : []),
      ],
    };
  }

  async function buscar(texto) {
    const emb = await cache.ou('embedding', { modelo: modeloEmbedding, texto }, async () => {
      const { vetor, ms } = await triagem.embedding(modeloEmbedding, texto);
      return { vetor, ms };
    });
    const inicio = Date.now();
    const docs = await buscarVetorial(banco.faqs, emb.vetor, { topK });
    return { docs, msEmbedding: emb.ms, msBusca: Date.now() - inicio, chamadas: emb.doCache ? 0 : 1 };
  }

  /**
   * Faz a chamada de um nó HTTP do fluxo ao Gemini: o modelo vem da URL, e o
   * prazo e as tentativas vêm das opções do nó, porque são parte do
   * comportamento que está sendo medido.
   */
  async function chamarNoHttp(nomeDoNo, corpo, etapa, cliente) {
    const no = fluxo.no(nomeDoNo);
    const modelo = /models\/([^:/]+):/.exec(no.parameters.url)[1];
    const prazoMs = Number(no.parameters.options?.timeout) || 300_000;
    const tentativasPorPrazo = no.retryOnFail ? Number(no.maxTries) || 3 : 1;
    const esperaPorPrazoMs = Number(no.waitBetweenTries) || 1000;
    let chamou = false;
    const r = await cache.ou(etapa, { modelo, corpo }, async () => {
      chamou = true;
      const { dados, ms } = await cliente.gerar(modelo, corpo, { prazoMs, tentativasPorPrazo, esperaPorPrazoMs });
      return { dados, ms };
    });
    return { dados: r.dados, ms: r.ms, modelo, chamou };
  }

  async function preparar(dados) {
    const nos = NOS_DO_PREPARO[preparo];
    const [montado] = fluxo.rodarCodigo(nos.montar, { nos: { Dados: dados } });
    let resposta;
    let ms = 0;
    let falhou = null;
    let chamadas = 0;
    try {
      const r = await chamarNoHttp(nos.chamar, montado.json.corpo, nos.etapa, triagem);
      resposta = r.dados;
      ms = r.ms;
      chamadas = r.chamou ? 1 : 0;
    } catch (erro) {
      if (erro instanceof CotaEsgotada) throw erro;
      // Como no fluxo: a falha do principal vai para o nó de reserva, quando
      // ele existe. Sem resposta dos dois, o "Consultas" usa o texto original.
      const reserva = `${nos.chamar} (reserva)`;
      let motivo = erro.message;
      if (fluxo.tem(reserva)) {
        try {
          const r = await chamarNoHttp(reserva, montado.json.corpo, `${nos.etapa}-reserva`, triagem);
          resposta = r.dados;
          ms = r.ms;
          chamadas = r.chamou ? 1 : 0;
          motivo = null;
        } catch (erroDaReserva) {
          if (erroDaReserva instanceof CotaEsgotada) throw erroDaReserva;
          motivo = `${erro.message}; reserva: ${erroDaReserva.message}`;
        }
      }
      if (motivo) {
        resposta = { error: { message: motivo } };
        falhou = motivo;
      }
    }
    const itens = fluxo.rodarCodigo('Consultas', { nos: { [nos.montar]: montado.json }, entrada: [{ json: resposta }] });
    return { itens, ms, falhou, chamadas };
  }

  async function responderComAgente(contexto, memoria) {
    const entrada = avaliarExpressao(agente.texto, contexto);
    const corpo = {
      systemInstruction: { parts: [{ text: agente.systemMessage }] },
      contents: [
        ...memoria.slice(-agente.janela * 2).map((m) => ({ role: m.papel === 'user' ? 'user' : 'model', parts: [{ text: m.texto }] })),
        { role: 'user', parts: [{ text: entrada }] },
      ],
      ...(Object.keys(agente.geracao).length ? { generationConfig: agente.geracao } : {}),
    };
    const falhas = [];
    let chamadas = 0;
    for (const modelo of agente.modelos) {
      try {
        const r = await cache.ou('agente', { modelo, corpo }, async () => {
          chamadas++;
          const { dados, ms } = await analise.gerar(modelo, corpo);
          return { texto: textoDaResposta(dados), ms };
        });
        if (r.texto.trim()) return { texto: r.texto, modelo, ms: r.ms, falhas, chamadas, entrada, partes: null };
        falhas.push(`${modelo}: resposta vazia`);
      } catch (erro) {
        // Cota do dia é problema do teste, não do fluxo: interrompe a rodada.
        if (erro instanceof CotaEsgotada) throw erro;
        falhas.push(erro.message);
      }
    }
    return { texto: null, modelo: null, ms: 0, falhas, chamadas, entrada, partes: null };
  }

  async function responderComAnalise(contexto, dados) {
    const [montada] = fluxo.rodarCodigo('Montar análise', { nos: { 'Montar contexto': contexto, Dados: dados } });
    const falhas = [];
    let chamadas = 0;
    for (const nome of CADEIA_DA_ANALISE.filter((n) => fluxo.tem(n))) {
      try {
        const r = await chamarNoHttp(nome, montada.json.corpo, 'analise', analise);
        if (r.chamou) chamadas++;
        const [lida] = fluxo.rodarCodigo('Ler análise', {
          nos: { 'Montar contexto': contexto, 'Montar análise': montada.json },
          entrada: [{ json: r.dados }],
        });
        return {
          texto: lida.json.Resposta || null,
          modelo: r.modelo,
          ms: r.ms,
          falhas,
          chamadas,
          partes: lida.json.PartesRespondidas ?? null,
        };
      } catch (erro) {
        if (erro instanceof CotaEsgotada) throw erro;
        falhas.push(erro.message);
      }
    }
    return { texto: null, modelo: null, ms: 0, falhas, chamadas, partes: null };
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

    if (preparo === 'direto') {
      const b = await buscar(texto);
      buscas.push({ consulta: texto, resultados: b.docs.map(resumoDoResultado) });
      tempos.embedding += b.msEmbedding;
      tempos.busca += b.msBusca;
      chamadas.embedding += b.chamadas;
      [contexto] = fluxo.rodarCodigo('Montar contexto', { nos: { Dados: dados }, entrada: b.docs.map((d) => itemDoN8n(d, 0)) });
    } else {
      const r = await preparar(dados);
      tempos.triagem = r.ms;
      chamadas.triagem = r.chamadas;
      const base = r.itens[0].json;
      triagemFeita = {
        tipo: base.Tipo,
        perguntaCompleta: base.PerguntaCompleta,
        consultas: base.Consultas,
        partes: base.Partes ?? null,
        falhou: r.falhou,
      };
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
      [contexto] = fluxo.rodarCodigo('Montar contexto', { nos: { Consultas: r.itens.map((i) => i.json) }, entrada });
    }

    const vazia = { texto: null, modelo: null, ms: 0, falhas: [], chamadas: 0, partes: null };
    const resposta = soBusca
      ? vazia
      : comAnalise
        ? await responderComAnalise(contexto.json, dados)
        : await responderComAgente(contexto.json, estado.memoria);
    tempos.analise = resposta.ms;
    chamadas.analise = resposta.chamadas;

    // A memória do Redis só guarda o turno que o agente completou.
    if (!comAnalise && resposta.texto) estado.memoria.push({ papel: 'user', texto: resposta.entrada }, { papel: 'bot', texto: resposta.texto });
    estado.historico.push({ papel: 'user', texto }, ...(resposta.texto ? [{ papel: 'bot', texto: resposta.texto }] : []));

    const trechos = contexto.json.TrechosDebug ?? [];
    return {
      soBusca,
      resposta: resposta.texto,
      modelo: resposta.modelo,
      falhas: resposta.falhas,
      triagem: triagemFeita,
      partes: resposta.partes,
      buscas,
      trechos,
      usados: trechos.filter((t) => t.usado).map((t) => t.faqId),
      // O bloco de trechos que a resposta leu: o juiz precisa dele para separar
      // informação a mais tirada dos trechos de informação inventada.
      contextoLido: contexto.json.TemContexto ? contexto.json.ContextoFaq : '',
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
