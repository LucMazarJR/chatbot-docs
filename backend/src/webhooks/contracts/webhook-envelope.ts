import type { InboundMessage } from '@/channels/whatsapp/domain/message.types';
import type { SessionStatus } from '@/channels/whatsapp/domain/session.types';

/**
 * Envelope canônico entregue ao n8n.
 *
 * Contrato público entre o gateway e o fluxo — mudar qualquer campo aqui exige
 * atualizar `n8n/whatsapp-chatbot.json` na mesma alteração. É deliberadamente
 * plano e estável, ao contrário do payload do WAHA, em que o fluxo precisava
 * cavar até `payload._data.key.remoteJidAlt` (campo interno do motor Baileys,
 * que quebrava se o motor mudasse).
 */
interface EnvelopeBase {
  /** Id único do evento. O n8n devolve como `idempotencyKey` ao responder. */
  eventId: string;
  occurredAt: string;
  sessionId: string;
}

export interface InboundMessagePayload {
  id: string;
  chatId: string;
  from: {
    phoneE164: string | null;
    pushName: string | null;
  };
  type: InboundMessage['type'];
  text: string | null;
  quotedMessageId: string | null;
  isGroup: boolean;
  timestamp: string;
}

export interface MessageReceivedEnvelope extends EnvelopeBase {
  type: 'message.received';
  message: InboundMessagePayload;
}

export interface SessionStatusEnvelope extends EnvelopeBase {
  type: 'session.status';
  status: SessionStatus;
  phoneE164: string | null;
}

export type AnyWebhookEnvelope = MessageReceivedEnvelope | SessionStatusEnvelope;

/**
 * Achata a mensagem para o formato entregue ao n8n.
 *
 * `chatId` é o valor que o fluxo devolve como `to` ao responder, fechando o
 * ciclo sem que o n8n precise entender o que é um JID.
 */
export function toInboundMessagePayload(message: InboundMessage): InboundMessagePayload {
  return {
    id: message.id,
    chatId: message.chatId,
    from: {
      phoneE164: message.from.phoneE164,
      pushName: message.from.pushName,
    },
    type: message.type,
    text: message.text,
    quotedMessageId: message.quotedMessageId,
    isGroup: message.isGroup,
    timestamp: message.timestamp,
  };
}
