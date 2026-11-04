// Lê um fluxo do n8n e roda os nós de código dele fora do n8n.
//
// O teste mede o que está no arquivo do fluxo, e não uma cópia da lógica: o
// prompt, o schema, os parâmetros da busca e o código de cada nó vêm daqui.
// Mudar o fluxo muda a medição junto, e uma cópia que divergisse mediria
// outro produto.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const RAIZ = new URL('../../', import.meta.url);

/**
 * Carrega um fluxo. A referência é um caminho a partir da raiz do repositório,
 * ou `git:<revisão>:<caminho>` para ler o fluxo de um commit e comparar o
 * antes e o depois de uma mudança.
 */
export function carregarFluxo(referencia) {
  let texto;
  if (referencia.startsWith('git:')) {
    const [, revisao, ...resto] = referencia.split(':');
    texto = execFileSync('git', ['show', `${revisao}:${resto.join(':')}`], {
      cwd: RAIZ,
      encoding: 'utf8',
      maxBuffer: 50e6,
    });
  } else {
    texto = fs.readFileSync(new URL(referencia, RAIZ), 'utf8');
  }
  const json = JSON.parse(texto);
  const porNome = new Map(json.nodes.map((n) => [n.name, n]));

  const no = (nome) => {
    const encontrado = porNome.get(nome);
    if (!encontrado) throw new Error(`O fluxo ${referencia} não tem o nó "${nome}".`);
    return encontrado;
  };

  return {
    referencia,
    tem: (nome) => porNome.has(nome),
    no,
    /**
     * Roda o jsCode de um nó com `$('Nó')` e `$input` simulados, como o
     * testar-codigo-staging.mjs. Em `nos`, um nó que saiu com vários itens é
     * uma lista de json; com um item só, o próprio json.
     */
    rodarCodigo(nome, { nos = {}, entrada = [] } = {}) {
      const $ = (outro) => {
        const valor = nos[outro];
        const itens = Array.isArray(valor) ? valor.map((json) => ({ json })) : [{ json: valor }];
        return { first: () => itens[0], all: () => itens, item: itens[0], params: porNome.get(outro)?.parameters };
      };
      const $input = { first: () => entrada[0], all: () => entrada, item: entrada[0] };
      return new Function('$', '$input', no(nome).parameters.jsCode)($, $input);
    },
  };
}

/**
 * Avalia um campo de texto do n8n ("=texto {{ expressão }} texto") com o
 * `$json` dado. Basta para os textos dos nós destes fluxos, que só usam
 * `$json` nas expressões.
 */
export function avaliarExpressao(modelo, $json) {
  if (typeof modelo !== 'string' || !modelo.startsWith('=')) return modelo;
  return modelo.slice(1).replace(/\{\{([\s\S]+?)\}\}/g, (_, expressao) => {
    const valor = new Function('$json', `return (${expressao});`)($json);
    return valor === undefined || valor === null ? '' : String(valor);
  });
}

/** O nome do modelo de um nó de chat do Gemini, sem o prefixo "models/". */
export const modeloDoNo = (no) => String(no.parameters.modelName || '').replace(/^models\//, '');
