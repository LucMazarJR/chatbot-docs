import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** O nome que o `SidebarProvider` do shadcn usa ao gravar a escolha. */
const COOKIE = "sidebar_state";

/**
 * A barra lateral estava aberta ou recolhida da última vez?
 *
 * LÓGICA DO LUCIANO: o componente grava a escolha num cookie, mas não a relê.
 * Ler num `useEffect` fazia a barra nascer aberta e recolher com animação em
 * toda troca de tela, porque cada página monta o seu próprio GateShell.
 *
 * Por isso a leitura acontece já na renderização, dos dois lados: no servidor,
 * pelo cabeçalho da requisição; no navegador, pelo `document.cookie`. Como é o
 * mesmo cookie, o HTML do SSR e a hidratação concordam, e a barra aparece
 * direto no estado certo.
 */
export const barraAbertaGuardada = createIsomorphicFn()
  .server(() => getCookie(COOKIE) !== "false")
  .client(() => !new RegExp(`(?:^|;\\s*)${COOKIE}=false`).test(document.cookie));
