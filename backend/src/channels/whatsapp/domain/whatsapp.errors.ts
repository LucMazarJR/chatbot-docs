import type { SessionStatus } from './session.types';

/**
 * Erros do canal, no domínio e não no adapter.
 *
 * Se vivessem dentro do adapter Baileys, a camada de aplicação teria que
 * importar o adapter para tratá-los — e a porta `WhatsAppProvider` deixaria de
 * ser a única fronteira. Qualquer provedor futuro (Cloud API) lança estes
 * mesmos tipos.
 */
export class SessionNotConnectedError extends Error {
  constructor(
    readonly sessionId: string,
    readonly status: SessionStatus,
  ) {
    super(`Sessão "${sessionId}" não está conectada (status: ${status}).`);
    this.name = 'SessionNotConnectedError';
  }
}
