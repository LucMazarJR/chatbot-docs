import type { InboundMessage } from './message.types';
import type { SessionStatus } from './session.types';

export interface MessageReceivedEvent {
  kind: 'message.received';
  message: InboundMessage;
}

export interface SessionStatusChangedEvent {
  kind: 'session.status';
  sessionId: string;
  status: SessionStatus;
  phoneE164: string | null;
}

/** Tudo que um provedor de WhatsApp pode empurrar para a aplicação. */
export type WhatsAppEvent = MessageReceivedEvent | SessionStatusChangedEvent;

export type WhatsAppEventHandler = (event: WhatsAppEvent) => Promise<void>;
