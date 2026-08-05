/**
 * Estados possíveis de uma sessão de WhatsApp.
 *
 * `LOGGED_OUT` é distinto de `DISCONNECTED` de propósito: o primeiro exige
 * intervenção humana (novo QR code), o segundo se resolve sozinho com
 * reconexão automática. Confundir os dois faz o gateway ficar tentando
 * reconectar para sempre uma sessão que o usuário desvinculou no celular.
 */
export type SessionStatus = 'STARTING' | 'QR' | 'CONNECTED' | 'DISCONNECTED' | 'LOGGED_OUT';

export interface SessionSnapshot {
  sessionId: string;
  status: SessionStatus;
  /** Número conectado, em E.164. Só existe quando `status === 'CONNECTED'`. */
  phoneE164: string | null;
  connectedAt: string | null;
  /** Quantas reconexões automáticas ocorreram desde o último `CONNECTED`. */
  reconnectAttempts: number;
  lastError: string | null;
}
