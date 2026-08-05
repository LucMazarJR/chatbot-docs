/**
 * Porta de persistência das credenciais de sessão do WhatsApp.
 *
 * Na Fase 1 o adapter grava em disco (volume Docker), que é o mínimo para o
 * gateway não pedir QR a cada restart. A porta existe para que a Fase 2 troque
 * por Postgres — requisito para rodar mais de uma réplica, já que credencial
 * em disco local não escala horizontalmente.
 *
 * O tipo do estado é `unknown` de propósito: seu formato pertence ao provedor
 * (o Baileys tem o seu, a Cloud API nem precisa disso), e o domínio não deve
 * conhecê-lo.
 */
export abstract class AuthStateRepository {
  /** Caminho/namespace isolado onde o adapter guarda o estado da sessão. */
  abstract resolveStoragePath(sessionId: string): Promise<string>;

  /** Descarta o estado — usado no logout, força novo QR code. */
  abstract clear(sessionId: string): Promise<void>;

  /** Indica se já existe credencial salva (usado no readiness check). */
  abstract exists(sessionId: string): Promise<boolean>;
}
