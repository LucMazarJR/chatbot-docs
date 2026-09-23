/**
 * Tema claro ou escuro do painel.
 *
 * LÓGICA DO LUCIANO: a escolha fica no localStorage e a classe `.dark` no
 * <html>. O script abaixo roda no <head>, antes da primeira pintura: aplicado
 * depois, pelo React, quem usa o tema escuro via um clarão branco a cada
 * página aberta. Sem escolha guardada, vale o tema do sistema.
 */
export type Tema = "claro" | "escuro";

const CHAVE = "painel:tema";

export const SCRIPT_DO_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE}");var e=t?t==="escuro":window.matchMedia("(prefers-color-scheme: dark)").matches;if(e)document.documentElement.classList.add("dark")}catch(_){}})();`;

export function temaAtual(): Tema {
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

export function aplicarTema(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "escuro");
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem armazenamento (aba privada), o tema vale até fechar a aba.
  }
}
