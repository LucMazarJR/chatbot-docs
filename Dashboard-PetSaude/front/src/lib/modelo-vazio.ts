// `import type` e apagado na compilacao, entao trazer a tipagem aqui nao puxa a
// biblioteca para o bundle -- ela continua entrando so pelo import() dinamico.
import type { CellObject } from "write-excel-file/browser";

import type { ModeloDoScript } from "./sandbox";

/**
 * Gera os arquivos de modelo vazios a partir do export `modelo` do script ativo.
 *
 * LÓGICA DO LUCIANO: o modelo sai do MESMO script que lê os arquivos. É o ponto
 * inteiro de o `modelo` morar dentro dele — trocar o script troca o parser e o
 * arquivo que a pessoa baixa na mesma hora. Com um .xlsx estático no `public/`,
 * a primeira mudança de formato deixaria o modelo desatualizado e o erro só
 * apareceria depois de alguém preencher 200 linhas na planilha errada.
 *
 * O que DEFINE o formato — as células da planilha e os parágrafos do Word —
 * está em funções puras, separadas do download. Não é gosto por camadas: é o
 * que permite gerar o arquivo fora do navegador e ler de volta com o mesmo
 * parser, fechando o laço modelo → arquivo → FAQs num teste. Sem isso, a única
 * forma de saber que o modelo baixado é legível seria alguém baixar e tentar.
 */

/** Nomes de coluna usados quando o script não declara nada. */
const COLUNAS_PADRAO = ["Pergunta", "Resposta", "Assunto", "Tags", "Fonte"];

/** Um parágrafo do modelo Word, descrito sem depender da biblioteca. */
export type BlocoWord = {
  texto: string;
  nivel?: 1 | 2;
  italico?: boolean;
  /** Corpo menor, usado nas instruções. */
  miudo?: boolean;
};

export function colunasDo(modelo: ModeloDoScript | null): string[] {
  const declaradas = modelo?.planilha?.colunas;
  return Array.isArray(declaradas) && declaradas.length > 0 ? declaradas : COLUNAS_PADRAO;
}

/** Cabeçalho + exemplos, na forma que o escritor de xlsx espera. */
export function celulasDaPlanilha(modelo: ModeloDoScript | null): CellObject[][] {
  const colunas = colunasDo(modelo);
  const exemplos = modelo?.planilha?.exemplos ?? [];

  const cabecalho: CellObject[] = colunas.map((nome) => ({
    value: nome,
    type: String,
    fontWeight: "bold",
    backgroundColor: "#E8F0EE",
  }));

  const linhas: CellObject[][] = exemplos.map((exemplo) =>
    colunas.map((_, i) => ({ value: String(exemplo[i] ?? ""), type: String })),
  );

  return [cabecalho, ...linhas];
}

export function opcoesDaPlanilha(modelo: ModeloDoScript | null) {
  const colunas = colunasDo(modelo);
  return {
    // Congela o cabeçalho: numa planilha de 200 linhas, rolar sem ele faz a
    // pessoa preencher a coluna errada.
    stickyRowsCount: 1,
    columns: colunas.map((nome) => ({
      width: nome.toLowerCase() === "resposta" ? 60 : nome.toLowerCase() === "pergunta" ? 45 : 22,
    })),
    sheet: "FAQs",
  };
}

/**
 * Os parágrafos do modelo Word.
 *
 * Parágrafos, nunca tabela: a ingestão Python lê `doc.paragraphs` e não enxerga
 * nada dentro de tabela do Word. Um modelo em tabela seria bonito e produziria
 * zero FAQs, sem erro nenhum.
 */
export function blocosDoWord(modelo: ModeloDoScript | null): BlocoWord[] {
  const instrucoes = modelo?.word?.instrucoes ?? [];
  const exemplo = modelo?.word?.exemplo ?? [];

  return [
    { texto: "Modelo de FAQs", nivel: 1 },
    { texto: "Apague este bloco de instrucoes antes de enviar o arquivo.", italico: true },
    { texto: "" },
    ...instrucoes.map((texto) => ({ texto, miudo: true })),
    { texto: "" },
    { texto: "Exemplo", nivel: 2 },
    ...exemplo.map((texto) => ({ texto })),
  ];
}

function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Sem o revoke, cada download deixa o arquivo inteiro preso na memória da
  // aba até ela ser fechada. O timeout dá tempo de o navegador iniciar a
  // gravação antes de a URL sumir.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function comData(base: string, extensao: string): string {
  const hoje = new Date().toISOString().slice(0, 10);
  return `${base}-${hoje}.${extensao}`;
}

export async function baixarModeloExcel(modelo: ModeloDoScript | null): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const planilha = writeXlsxFile(celulasDaPlanilha(modelo), opcoesDaPlanilha(modelo));

  // toBlob e o mesmo caminho do modelo Word: um jeito só de baixar, em vez de
  // um `toFile` aqui e um Blob lá.
  baixar(await planilha.toBlob(), comData("modelo-faqs", "xlsx"));

  // A planilha sai só com cabeçalho e exemplos. As instruções (`modelo.planilha
  // .ajuda`) ficam na tela, ao lado do botão, e não dentro do arquivo: qualquer
  // linha de texto na mesma aba viraria linha de dados, e o parser tentaria
  // transformar a instrução numa FAQ.
}

export async function baixarModeloWord(modelo: ModeloDoScript | null): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const filhos = blocosDoWord(modelo).map((bloco) => {
    if (bloco.nivel) {
      return new Paragraph({
        text: bloco.texto,
        heading: bloco.nivel === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      });
    }
    if (bloco.italico || bloco.miudo) {
      return new Paragraph({
        children: [
          new TextRun({
            text: bloco.texto,
            italics: bloco.italico,
            size: bloco.miudo ? 20 : undefined,
          }),
        ],
      });
    }
    return new Paragraph({ text: bloco.texto });
  });

  const doc = new Document({ sections: [{ children: filhos }] });
  baixar(await Packer.toBlob(doc), comData("modelo-faqs", "docx"));
}
