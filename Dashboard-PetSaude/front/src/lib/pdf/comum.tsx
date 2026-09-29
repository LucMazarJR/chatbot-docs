import { pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * Peças comuns aos PDFs do painel.
 *
 * LÓGICA DO LUCIANO: o PDF é gerado no navegador, com a biblioteca carregada só
 * no clique de "Baixar PDF". Ela pesa perto de 1 MB, e carregá-la junto da tela
 * deixaria o painel inteiro mais lento para quem nunca vai baixar nada.
 *
 * A fonte é a Helvetica embutida no próprio formato PDF: cobre todo acento do
 * português e não precisa baixar arquivo de fonte. Não cobre emoji nem símbolos
 * como "≤", e por isso o texto dos PDFs escreve "positivo" e "negativo" em vez
 * dos polegares.
 */

export const TINTA = {
  primaria: "#1c1d33",
  secundaria: "#575a76",
  fraca: "#8a8ca6",
  linha: "#dcdce8",
  fundo: "#f3f3f8",
  marca: "#4b4fa8",
  atencao: "#8e5d05",
  erro: "#a83845",
} as const;

export const estilos = StyleSheet.create({
  pagina: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: TINTA.primaria,
    lineHeight: 1.35,
  },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitulo: { fontSize: 9.5, color: TINTA.secundaria, marginBottom: 14 },
  secao: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  nota: { fontSize: 8.5, color: TINTA.secundaria },
  negrito: { fontFamily: "Helvetica-Bold" },
  caixa: {
    borderWidth: 1,
    borderColor: TINTA.linha,
    borderRadius: 4,
    padding: 8,
  },
  rodape: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: TINTA.fraca,
  },
});

/** Rodapé com a origem e a página, repetido em todas as páginas. */
export function Rodape({ texto }: { texto: string }) {
  return (
    <View style={estilos.rodape} fixed>
      <Text>{texto}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

/** Gera o PDF e entrega o arquivo ao navegador, com o nome dado. */
export async function baixar(documento: ReactElement, nomeDoArquivo: string): Promise<void> {
  // O tipo do `pdf()` pede o elemento <Document> exato; os documentos daqui
  // são componentes que devolvem um <Document>, o que a biblioteca aceita.
  const blob = await pdf(documento as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeDoArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora cancelava o download em alguns navegadores: o clique só
  // agenda a leitura do endereço.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
