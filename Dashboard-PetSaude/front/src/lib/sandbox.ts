/**
 * Roda o script de geração de FAQs escrito pelo administrador.
 *
 * LÓGICA DO LUCIANO: o servidor guarda o script e NUNCA o executa. Quem executa
 * é esta função, num Web Worker descartável, no navegador de quem está
 * importando.
 *
 * Por que Worker e não `<iframe sandbox>`: o iframe daria origem nula, que é uma
 * fronteira mais forte no papel — mas um iframe de srcdoc divide a thread com a
 * página, e um `while (true)` no script congela a aba inteira, sem que dê para
 * fazer nada a respeito. O Worker tem thread própria e `terminate()` de verdade.
 * Como a falha realista aqui é um script COM DEFEITO, e não um administrador
 * mal-intencionado (que, por definição, já pode fazer o que quiser com a base de
 * FAQs), a capacidade de matar um laço infinito vale mais que a origem nula.
 *
 * O que este isolamento entrega, então:
 *   - thread separada: laço infinito não trava a aba, e o timeout mata mesmo
 *   - sem DOM, sem `document.cookie`, sem acesso ao estado da página
 *   - `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB` e
 *     `caches` sombreados como `undefined` antes de o script rodar
 *   - o worker é destruído ao fim de cada execução, com ou sem sucesso
 *
 * O que ele NÃO entrega, e está dito de propósito: não é defesa contra um
 * administrador mal-intencionado. É contenção de erro, não de má-fé. O token da
 * sessão é `httpOnly` e não é alcançável por JavaScript nenhum, aqui incluído.
 */

export type EntradaScript = {
  tipo: "docx" | "xlsx";
  nomeArquivo: string;
  paragrafos?: string[];
  linhas?: Record<string, string>[];
};

export type FaqGerada = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source: string;
  linha: number;
};

export type AvisoScript = { linha: number; mensagem: string };

export type SaidaScript = { faqs: FaqGerada[]; avisos: AvisoScript[] };

export type ModeloDoScript = {
  nome?: string;
  planilha?: { colunas?: string[]; exemplos?: string[][]; ajuda?: string[] };
  word?: { instrucoes?: string[]; exemplo?: string[] };
};

export class ErroDeScript extends Error {
  constructor(
    message: string,
    readonly detalhe?: string,
  ) {
    super(message);
    this.name = "ErroDeScript";
  }
}

const TIMEOUT_PADRAO_MS = 10_000;

/**
 * Globais que o script não tem por que alcançar.
 *
 * `delete self.fetch` não resolve: fetch mora no protótipo de
 * WorkerGlobalScope, não na instância. Sombrear com defineProperty resolve.
 */
const GLOBAIS_BLOQUEADAS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "indexedDB",
  "caches",
  "EventSource",
  "Notification",
  "BroadcastChannel",
];

/**
 * Tira os `export` para as declarações caírem no escopo do worker.
 *
 * O script é escrito como módulo ES porque é assim que se lê e se edita. O
 * worker aqui é clássico, então `export` seria erro de sintaxe — e um worker
 * de módulo não ajudaria, porque não há de onde importar.
 */
function prepararCodigo(codigo: string): string {
  return codigo
    .replace(/^\s*export\s+(const|let|var|function|class)\s/gm, "$1 ")
    .replace(/^\s*export\s+default\s/gm, "var __default = ");
}

function fonteDoWorker(codigo: string): string {
  return `
"use strict";
(function () {
  var bloquear = ${JSON.stringify(GLOBAIS_BLOQUEADAS)};
  for (var i = 0; i < bloquear.length; i++) {
    try {
      Object.defineProperty(self, bloquear[i], {
        value: undefined, writable: false, configurable: false,
      });
    } catch (e) { /* já bloqueada ou não configurável — segue */ }
  }
})();

var modelo, gerarFaqs;

try {
${prepararCodigo(codigo)}
} catch (erro) {
  self.postMessage({
    tipo: "erro",
    mensagem: "O script nao pode ser carregado.",
    detalhe: String((erro && erro.stack) || erro),
  });
}

self.onmessage = function (evento) {
  var pedido = evento.data || {};
  try {
    if (pedido.acao === "modelo") {
      if (typeof modelo === "undefined") {
        throw new Error("O script nao exporta 'modelo'.");
      }
      self.postMessage({ tipo: "resultado", dados: modelo });
      return;
    }

    if (typeof gerarFaqs !== "function") {
      throw new Error("O script nao exporta a funcao 'gerarFaqs'.");
    }

    var saida = gerarFaqs(pedido.entrada) || {};
    self.postMessage({
      tipo: "resultado",
      dados: {
        faqs: Array.isArray(saida.faqs) ? saida.faqs : [],
        avisos: Array.isArray(saida.avisos) ? saida.avisos : [],
      },
    });
  } catch (erro) {
    self.postMessage({
      tipo: "erro",
      mensagem: String((erro && erro.message) || erro),
      detalhe: String((erro && erro.stack) || ""),
    });
  }
};
`;
}

type Pedido = { acao: "gerar"; entrada: EntradaScript } | { acao: "modelo" };

function executar<T>(codigo: string, pedido: Pedido, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let url: string | undefined;
    let worker: Worker | undefined;
    let relogio: ReturnType<typeof setTimeout> | undefined;

    const encerrar = () => {
      if (relogio !== undefined) clearTimeout(relogio);
      // terminate() antes de revokeObjectURL: a ordem inversa deixa o worker
      // vivo mais um instante com a URL já revogada, e o Firefox reclama.
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
    };

    try {
      const blob = new Blob([fonteDoWorker(codigo)], { type: "text/javascript" });
      url = URL.createObjectURL(blob);
      worker = new Worker(url);
    } catch (erro) {
      encerrar();
      reject(
        new ErroDeScript(
          "Nao foi possivel iniciar o ambiente de execucao do script.",
          erro instanceof Error ? erro.message : String(erro),
        ),
      );
      return;
    }

    relogio = setTimeout(() => {
      encerrar();
      reject(
        new ErroDeScript(
          `O script passou de ${Math.round(timeoutMs / 1000)}s sem responder e foi interrompido.`,
          "Procure por um laco que nao termina, ou reduza o tamanho do arquivo.",
        ),
      );
    }, timeoutMs);

    worker.onmessage = (evento: MessageEvent) => {
      const dados = evento.data ?? {};
      encerrar();
      if (dados.tipo === "resultado") resolve(dados.dados as T);
      else reject(new ErroDeScript(dados.mensagem ?? "Falha no script.", dados.detalhe));
    };

    // Erro de sintaxe no script chega por aqui, antes de qualquer mensagem: o
    // worker nem começa. Sem este handler, o sintoma seria só o timeout de 10s,
    // e a pessoa ficaria sem saber que errou uma chave.
    worker.onerror = (evento: ErrorEvent) => {
      encerrar();
      reject(
        new ErroDeScript(
          evento.message || "O script tem um erro que impede a execucao.",
          evento.lineno ? `Linha ${evento.lineno} do script.` : undefined,
        ),
      );
    };

    worker.postMessage(pedido);
  });
}

/** Roda `gerarFaqs` sobre o documento já decodificado. */
export function rodarScript(
  codigo: string,
  entrada: EntradaScript,
  timeoutMs = TIMEOUT_PADRAO_MS,
): Promise<SaidaScript> {
  return executar<SaidaScript>(codigo, { acao: "gerar", entrada }, timeoutMs);
}

/** Lê o export `modelo`, que descreve os arquivos vazios .xlsx e .docx. */
export function lerModeloDoScript(
  codigo: string,
  timeoutMs = TIMEOUT_PADRAO_MS,
): Promise<ModeloDoScript> {
  return executar<ModeloDoScript>(codigo, { acao: "modelo" }, timeoutMs);
}
