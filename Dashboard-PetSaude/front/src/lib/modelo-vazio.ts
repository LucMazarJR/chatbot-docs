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
 */

/** Nomes de coluna usados quando o script não declara nada. */
const COLUNAS_PADRAO = ["Pergunta", "Resposta", "Assunto", "Tags", "Fonte"];

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

export function colunasDo(modelo: ModeloDoScript | null): string[] {
  const declaradas = modelo?.planilha?.colunas;
  return Array.isArray(declaradas) && declaradas.length > 0 ? declaradas : COLUNAS_PADRAO;
}

export async function baixarModeloExcel(modelo: ModeloDoScript | null): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

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

  const planilha = writeXlsxFile([cabecalho, ...linhas], {
    // Congela o cabeçalho: numa planilha de 200 linhas, rolar sem ele faz a
    // pessoa preencher a coluna errada.
    stickyRowsCount: 1,
    columns: colunas.map((nome) => ({
      width: nome.toLowerCase() === "resposta" ? 60 : nome.toLowerCase() === "pergunta" ? 45 : 22,
    })),
    sheet: "FAQs",
  });

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

  const instrucoes = modelo?.word?.instrucoes ?? [];
  const exemplo = modelo?.word?.exemplo ?? [];

  const filhos = [
    new Paragraph({
      text: "Modelo de FAQs",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Apague este bloco de instrucoes antes de enviar o arquivo.",
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    ...instrucoes.map(
      (linha) => new Paragraph({ children: [new TextRun({ text: linha, size: 20 })] }),
    ),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Exemplo",
      heading: HeadingLevel.HEADING_2,
    }),
    // Parágrafos, nunca tabela: a ingestão Python lê `doc.paragraphs` e não
    // enxerga nada dentro de tabela do Word. Um modelo em tabela seria bonito e
    // produziria zero FAQs, sem erro nenhum.
    ...exemplo.map((linha) => new Paragraph({ text: linha })),
  ];

  const doc = new Document({ sections: [{ children: filhos }] });
  baixar(await Packer.toBlob(doc), comData("modelo-faqs", "docx"));
}
