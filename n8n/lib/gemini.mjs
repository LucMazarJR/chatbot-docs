// Chamadas ao Gemini com a chave de um papel: triagem ou análise.
//
// Cada papel tem a sua chave, de um projeto Google próprio, porque a cota
// gratuita é por projeto: um dia de testes não pode deixar o staging sem
// reescrita, nem o staging pode gastar a cota do chat que está em uso.
//
// Dois tipos de falha são tratados de jeitos diferentes:
//
// 1. A cota por minuto e a sobrecarga (429, 500, 503) passam sozinhas. Uma
//    avaliação faz centenas de chamadas seguidas e esbarra nelas; o chat, que
//    faz uma por mensagem, não. O próprio 429 diz o limite por minuto e quanto
//    esperar, e a partir dele as chamadas daquele modelo passam a sair
//    espaçadas, em vez de cada uma bater no limite e esperar às cegas. O tempo
//    devolvido é o da tentativa que deu certo, que é o que se compara com o chat.
// 2. A cota do DIA não passa com espera. Ela vira CotaEsgotada na hora, e a
//    rodada para com o que já tem no cache.
//
// O prazo e as tentativas por prazo estourado imitam o nó do fluxo quando ele
// define os dois: são parte do comportamento que está sendo medido.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class CotaEsgotada extends Error {
  constructor(papel, modelo) {
    super(
      `A cota diária do ${modelo} na chave de ${papel} acabou. O que já rodou está no cache: ` +
        'rode de novo amanhã, ou passe outro modelo pela linha de comando.',
    );
    this.name = 'CotaEsgotada';
  }
}

export class FalhaGemini extends Error {
  constructor(mensagem, status = null) {
    super(mensagem);
    this.name = 'FalhaGemini';
    this.status = status;
  }
}

/**
 * O que o 429 informa: se a cota é do dia, o limite por minuto (de chamadas ou
 * de tokens) e quanto esperar.
 */
export function lerLimite(texto) {
  let detalhes = [];
  try {
    detalhes = JSON.parse(texto)?.error?.details ?? [];
  } catch {
    // Corpo que não é JSON: fica só o que a mensagem crua diz.
  }
  const violacoes = detalhes.flatMap((d) => d.violations ?? []);
  const doDia = /PerDay/i.test(texto) && !violacoes.some((v) => /PerMinute/i.test(v.quotaId ?? ''));
  const porMinuto = violacoes.find((v) => /PerMinute/i.test(v.quotaId ?? ''));
  const atraso = detalhes.find((d) => d.retryDelay)?.retryDelay;
  // O limite de tokens não vira intervalo entre chamadas: o que pesa é o
  // tamanho de cada pedido, e o jeito é esperar o tempo que o 429 pede.
  const deTokens = /Token/i.test(porMinuto?.quotaId ?? '');
  return {
    doDia,
    limitePorMinuto: porMinuto && !deTokens ? Number(porMinuto.quotaValue) || null : null,
    tokensPorMinuto: porMinuto && deTokens ? Number(porMinuto.quotaValue) || null : null,
    esperaMs: atraso ? Math.ceil(parseFloat(atraso) * 1000) : null,
  };
}

// A cota do dia acabou numa chave; o cliente tenta a próxima antes de desistir.
class CotaDoDiaNaChave extends Error {}

// Um portão por chave e modelo, compartilhado entre os clientes: a cota por
// minuto é do projeto da chave, e dois papéis usando a mesma chave somam as
// chamadas no mesmo limite.
const portoes = new Map();

function portaoDe(nomeDaChave, modelo) {
  const nome = `${nomeDaChave}:${modelo}`;
  if (!portoes.has(nome)) portoes.set(nome, { proximaSaida: 0, intervaloMs: 0 });
  return portoes.get(nome);
}

/**
 * Cria o cliente de um papel. Sem rodízio, as chaves são usadas em ordem:
 * quando a cota do dia de um modelo acaba numa chave, as chamadas daquele
 * modelo passam para a seguinte, como os scripts de importação fazem com os
 * embeddings. Com rodízio, cada chamada vai para a próxima chave da lista, e o
 * limite por minuto de cada uma soma: serve ao juiz do teste, que não faz
 * parte do chat e pode usar as chaves que estiverem livres.
 *
 * @param {{ papel: string, chaves: { nome: string, valor: string }[], rodizio?: boolean }} config
 */
export function criarCliente({ papel, chaves, rodizio = false }) {
  const validas = chaves.filter((c) => c.valor);
  if (!validas.length) {
    throw new Error(`Falta a ${chaves.map((c) => c.nome).join(' ou a ')} no .env da raiz: é a chave da ${papel}.`);
  }

  let chamadas = 0;
  let vez = 0;
  // As chaves em que a cota do dia de cada modelo acabou.
  const esgotadas = new Map();

  async function aguardarVez(portao) {
    const agora = Date.now();
    const saida = Math.max(agora, portao.proximaSaida);
    portao.proximaSaida = saida + portao.intervaloMs;
    if (saida > agora) await esperar(saida - agora);
  }

  function escolherChave(modelo) {
    const fora = esgotadas.get(modelo) ?? new Set();
    const livres = validas.filter((c) => !fora.has(c.nome));
    if (!livres.length) return null;
    return rodizio ? livres[vez++ % livres.length] : livres[0];
  }

  async function chamar(caminho, corpo, opcoes) {
    for (;;) {
      const chave = escolherChave(opcoes.modelo);
      if (!chave) throw new CotaEsgotada(papel, opcoes.modelo);
      try {
        return await chamarCom(chave.valor, portaoDe(chave.nome, opcoes.modelo), caminho, corpo, opcoes);
      } catch (erro) {
        if (!(erro instanceof CotaDoDiaNaChave)) throw erro;
        if (!esgotadas.has(opcoes.modelo)) esgotadas.set(opcoes.modelo, new Set());
        esgotadas.get(opcoes.modelo).add(chave.nome);
        const proxima = escolherChave(opcoes.modelo);
        process.stderr.write(
          `\n[${papel}] ${opcoes.modelo}: a cota do dia acabou na ${chave.nome}` +
            (proxima ? `; seguindo com a ${proxima.nome}\n` : '\n'),
        );
      }
    }
  }

  async function chamarCom(chave, portao, caminho, corpo, { modelo, prazoMs = 90_000, tentativasPorPrazo = 3, esperaPorPrazoMs = 5000 }) {
    let falhasDeRede = 0;
    let limitadas = 0;
    for (;;) {
      await aguardarVez(portao);
      const inicio = Date.now();
      let resposta;
      chamadas++;
      try {
        resposta = await fetch(`${BASE}/${caminho}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
          body: JSON.stringify(corpo),
          signal: AbortSignal.timeout(prazoMs),
        });
      } catch (erro) {
        falhasDeRede++;
        if (falhasDeRede < tentativasPorPrazo) {
          await esperar(esperaPorPrazoMs * falhasDeRede);
          continue;
        }
        const motivo = erro.name === 'TimeoutError' ? `prazo de ${prazoMs / 1000} s estourado` : erro.cause?.code || erro.message;
        throw new FalhaGemini(`${modelo}: ${motivo}`);
      }
      if (resposta.ok) return { dados: await resposta.json(), ms: Date.now() - inicio };

      const texto = await resposta.text();
      if (resposta.status === 429) {
        const limite = lerLimite(texto);
        if (limite.doDia) throw new CotaDoDiaNaChave();
        // Daqui em diante, as chamadas deste modelo saem no ritmo do limite.
        const intervalo = limite.limitePorMinuto ? Math.ceil(60_000 / limite.limitePorMinuto) + 250 : 0;
        if (intervalo > portao.intervaloMs) {
          portao.intervaloMs = intervalo;
          process.stderr.write(`\n[${papel}] ${modelo}: limite de ${limite.limitePorMinuto} por minuto; uma chamada a cada ${(intervalo / 1000).toFixed(1)} s\n`);
        }
        if (limite.tokensPorMinuto && !portao.avisouTokens) {
          portao.avisouTokens = true;
          process.stderr.write(`\n[${papel}] ${modelo}: limite de ${limite.tokensPorMinuto} tokens por minuto; esperando o tempo que o Gemini pede\n`);
        }
        portao.proximaSaida = Math.max(portao.proximaSaida, Date.now() + (limite.esperaMs ?? 15_000) + 500);
        if (++limitadas <= 8) continue;
      } else if ([500, 503].includes(resposta.status) && ++limitadas <= 5) {
        await esperar(10_000 * limitadas);
        continue;
      }
      throw new FalhaGemini(`${modelo}: Gemini ${resposta.status} ${texto.slice(0, 160)}`, resposta.status);
    }
  }

  return {
    papel,
    get chamadas() {
      return chamadas;
    },
    gerar: (modelo, corpo, opcoes = {}) => chamar(`models/${modelo}:generateContent`, corpo, { ...opcoes, modelo }),
    async embedding(modelo, texto, taskType = null) {
      const { dados, ms } = await chamar(
        `models/${modelo}:embedContent`,
        { content: { parts: [{ text: texto }] }, ...(taskType ? { taskType } : {}) },
        { modelo },
      );
      return { vetor: dados.embedding.values, ms };
    },
  };
}

/** O texto de uma resposta do generateContent, sem as partes de raciocínio. */
export function textoDaResposta(dados) {
  const partes = dados?.candidates?.[0]?.content?.parts ?? [];
  return partes
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('');
}
