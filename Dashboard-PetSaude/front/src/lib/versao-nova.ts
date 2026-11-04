/**
 * Recarrega a página quando a aba ficou numa versão do painel que já saiu do ar.
 *
 * LÓGICA DO LUCIANO: cada deploy troca o nome dos arquivos de cada tela. Uma aba
 * aberta antes dele pede os nomes antigos, o servidor responde 404, e a tela não
 * abre mais, enquanto para quem abriu depois funciona. Recarregar busca a versão
 * nova. O intervalo mínimo impede um laço de recarga se o arquivo faltar por
 * outro motivo, e aí a tela de erro aparece normalmente.
 */
const CHAVE = "painel:recarregou-por-versao";
const INTERVALO_MINIMO_MS = 30_000;

// Cada navegador escreve a falha de um jeito: Chrome, Firefox e Safari, nesta ordem.
const FALHA_DE_ARQUIVO_DA_TELA =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function ehVersaoAntiga(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? "");
  return FALHA_DE_ARQUIVO_DA_TELA.test(mensagem);
}

/** Devolve `true` se a recarga começou. */
export function recarregarParaVersaoNova(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE)) || 0;
    if (Date.now() - ultima < INTERVALO_MINIMO_MS) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    // Sem sessionStorage não há como saber se já recarregou: melhor mostrar a
    // tela de erro do que arriscar recarregar sem parar.
    return false;
  }
  window.location.reload();
  return true;
}
