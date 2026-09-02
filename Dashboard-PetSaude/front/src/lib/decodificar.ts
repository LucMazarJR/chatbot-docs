import type { EntradaScript } from "./sandbox";

/**
 * Transforma o arquivo enviado em algo que o script de geração entenda.
 *
 * LÓGICA DO LUCIANO: aqui só se DECODIFICA — .docx vira lista de parágrafos,
 * .xlsx vira lista de linhas chaveadas pelo cabeçalho. Nenhuma regra de FAQ
 * mora neste arquivo, de propósito: a regra é o script do administrador, e ela
 * precisa continuar sendo uma coisa só, editável numa tela. Se um marcador
 * vazasse para cá, mudar o formato passaria a exigir um deploy.
 *
 * As bibliotecas entram por `import()` dinâmico: só quem abre a importação paga
 * o download delas, e as telas do dia a dia não engordam.
 */

export class ErroDeArquivo extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroDeArquivo";
  }
}

/** 10 MB. Um .docx de FAQs bem grande não passa de 1 MB. */
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export function extensaoDe(nome: string): "docx" | "xlsx" | null {
  const limpo = nome.trim().toLowerCase();
  if (limpo.endsWith(".docx")) return "docx";
  if (limpo.endsWith(".xlsx")) return "xlsx";
  return null;
}

/**
 * Word → parágrafos, preservando os marcadores de lista.
 *
 * Usa `convertToHtml` e não `extractRawText` porque o texto cru perde a
 * distinção entre parágrafo comum e item de lista. É essa distinção que o
 * converter_para_markdown do enviar_dados.py usa para transformar item de
 * lista em "- texto" — e é assim que respostas com vários itens ganham
 * estrutura. Com texto cru, a lista chegaria ao script como frases soltas.
 *
 * Tabelas ficam de fora: a ingestão Python lê `doc.paragraphs` e não enxerga
 * conteúdo dentro de tabela. Ler tabela aqui faria o mesmo arquivo render FAQs
 * diferentes conforme o caminho de entrada.
 */
async function lerDocx(arquivo: File): Promise<string[]> {
  // "mammoth" e nao "mammoth/mammoth.browser": o pacote declara um campo
  // `browser` que troca os dois modulos dependentes de Node pelos equivalentes
  // de navegador, entao o Vite ja resolve o build certo -- e por este caminho
  // vem a tipagem, que o arquivo avulso nao tem.
  const mammoth = await import("mammoth");
  const arrayBuffer = await arquivo.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const doc = new DOMParser().parseFromString(html, "text/html");

  const paragrafos: string[] = [];
  doc.body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6").forEach((el) => {
    const texto = (el.textContent ?? "").replace(/ /g, " ").trim();
    if (!texto) return;
    paragrafos.push(el.tagName === "LI" ? `- ${texto}` : texto);
  });

  return paragrafos;
}

/**
 * Planilha → linhas chaveadas pelo cabeçalho.
 *
 * A primeira linha não vazia é o cabeçalho. Coluna sem título vira "coluna N"
 * em vez de ser descartada: o script pode estar contando com a posição, e
 * sumir com a coluna em silêncio seria pior que entregá-la com nome feio.
 */
async function lerXlsx(arquivo: File): Promise<Record<string, string>[]> {
  // O subcaminho /browser e explicito de proposito: o pacote nao tem export
  // raiz, e o build de Node puxaria dependencias que nao existem aqui.
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const bruto = (await readXlsxFile(arquivo)) as unknown as unknown[][];

  const primeiraPreenchida = bruto.findIndex((linha) =>
    linha.some((celula) => celula !== null && String(celula).trim() !== ""),
  );
  if (primeiraPreenchida === -1) return [];

  const cabecalho = bruto[primeiraPreenchida].map((celula, i) => {
    const nome = celula === null || celula === undefined ? "" : String(celula).trim();
    return nome || `coluna ${i + 1}`;
  });

  return bruto.slice(primeiraPreenchida + 1).map((linha) => {
    const objeto: Record<string, string> = {};
    cabecalho.forEach((nome, i) => {
      const celula = linha[i];
      // Data e número viram texto aqui: o script trabalha com strings, e uma
      // referência escrita como "2024" chegaria como number sem isto.
      objeto[nome] =
        celula === null || celula === undefined
          ? ""
          : celula instanceof Date
            ? celula.toLocaleDateString("pt-BR")
            : String(celula).trim();
    });
    return objeto;
  });
}

export async function decodificarArquivo(arquivo: File): Promise<EntradaScript> {
  const tipo = extensaoDe(arquivo.name);
  if (!tipo) {
    throw new ErroDeArquivo(
      "Formato nao reconhecido. Envie um arquivo .docx (Word) ou .xlsx (Excel).",
    );
  }

  if (arquivo.size === 0) {
    throw new ErroDeArquivo("O arquivo esta vazio.");
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new ErroDeArquivo(
      `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e o limite e 10 MB. ` +
        "Divida em arquivos menores.",
    );
  }

  try {
    if (tipo === "docx") {
      return { tipo, nomeArquivo: arquivo.name, paragrafos: await lerDocx(arquivo) };
    }
    return { tipo, nomeArquivo: arquivo.name, linhas: await lerXlsx(arquivo) };
  } catch (erro) {
    if (erro instanceof ErroDeArquivo) throw erro;
    // O .doc antigo e o .xls antigo são os dois enganos mais prováveis, e o
    // erro cru das bibliotecas ("Can't find end of central directory") não
    // ajudaria ninguém a entender o que fazer.
    throw new ErroDeArquivo(
      "Nao foi possivel ler o arquivo. Confira se ele e mesmo um " +
        (tipo === "docx" ? ".docx (Word 2007 ou mais novo)" : ".xlsx (Excel 2007 ou mais novo)") +
        " e se nao esta protegido por senha.",
    );
  }
}
