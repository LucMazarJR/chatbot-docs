/**
 * Tipos de conteúdo que o gateway reconhece.
 *
 * A Fase 1 só *envia* texto, mas *recebe* e classifica tudo — quem decide a
 * resposta para mídia é o n8n, preservando a divisão de responsabilidade atual
 * (a copy do bot vive no fluxo, não no backend).
 */
export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'unsupported';

export interface MessageSender {
  /** JID cru do WhatsApp, ex: `5516999998888@s.whatsapp.net`. */
  chatId: string;
  /** Número normalizado em E.164, ex: `+5516999998888`. `null` para grupos. */
  phoneE164: string | null;
  /** Nome de exibição que o próprio contato definiu. */
  pushName: string | null;
}

/**
 * Mensagem recebida, já normalizada.
 *
 * Nenhum campo cru do Baileys aparece aqui — essa é a fronteira que permite
 * trocar o provedor (Cloud API oficial da Meta) sem tocar no resto do sistema.
 */
export interface InboundMessage {
  /** Id da mensagem no WhatsApp. Chave de deduplicação. */
  id: string;
  sessionId: string;
  chatId: string;
  from: MessageSender;
  type: MessageType;
  /** Texto ou legenda da mídia. `null` quando não há texto algum. */
  text: string | null;
  /** Id da mensagem citada, quando é uma resposta. */
  quotedMessageId: string | null;
  isGroup: boolean;
  timestamp: string;
}

export interface OutboundTextMessage {
  sessionId: string;
  to: string;
  text: string;
  replyTo?: string;
}
