/**
 * Tema claro ou escuro do painel.
 *
 * LÓGICA DO LUCIANO: a escolha fica no localStorage e a classe `.dark` no
 * <html>. O script abaixo roda no <head>, antes da primeira pintura: aplicado
 * depois, pelo React, quem usa o tema escuro via um clarão branco a cada
 * página aberta.
 *
 * Sem escolha guardada, o painel abre claro, mesmo com o sistema no escuro:
 * decisão do projeto, para a equipe ver o painel igual em todo computador. O
 * escuro vale só para quem escolheu no botão.
 */
export type Tema = "claro" | "escuro";

const CHAVE = "painel:tema";

export const SCRIPT_DO_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE}");if(t==="escuro")document.documentElement.classList.add("dark")}catch(_){}})();`;

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
