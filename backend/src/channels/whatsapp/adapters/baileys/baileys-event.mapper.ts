import type { InboundMessage, MessageType } from '@/channels/whatsapp/domain/message.types';

/**
 * Tradução do formato cru do Baileys para o domínio.
 *
 * Este é o único arquivo do projeto que sabe o que é `extendedTextMessage`,
 * `stanzaId` ou `@lid`. Tudo isso vazava para o workflow do n8n antes (que lia
 * `body.payload._data.key.remoteJidAlt` direto) — e era por isso que trocar o
 * motor do WhatsApp quebrava o bot.
 *
 * É de propósito uma função pura, sem `import` de runtime do Baileys: o pacote
 * é ESM puro e carregá-lo tornaria este código difícil de testar.
 */

/** Subconjunto do `WebMessageInfo` do Baileys que realmente consumimos. */
export interface RawBaileysMessage {
  key?: {
    remoteJid?: string | null;
    fromMe?: boolean | null;
    id?: string | null;
    participant?: string | null;
    /**
     * Campos não declarados nos tipos do Baileys, mas presentes em runtime
     * quando o WhatsApp usa endereçamento LID: carregam o JID "do outro tipo"
     * (telefone quando `remoteJid` é LID, e vice-versa).
     */
    remoteJidAlt?: string | null;
    participantAlt?: string | null;
  } | null;
  message?: RawMessageContent | null;
  messageTimestamp?: number | { toNumber: () => number } | null;
  pushName?: string | null;
}

type RawMessageContent = Record<string, unknown> & {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null; contextInfo?: RawContextInfo | null } | null;
};

interface RawContextInfo {
  stanzaId?: string | null;
}

/** Envelopes que embrulham o conteúdo real e precisam ser descascados. */
const WRAPPER_KEYS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
] as const;

/** Chave do conteúdo no proto → tipo do domínio. */
const TYPE_BY_CONTENT_KEY: Record<string, MessageType> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  audioMessage: 'audio',
  videoMessage: 'video',
  documentMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  liveLocationMessage: 'location',
  contactMessage: 'contact',
  contactsArrayMessage: 'contact',
  reactionMessage: 'reaction',
};

/**
 * Mensagens que existem no protocolo mas não representam algo que um cidadão
 * enviou (confirmações de entrega, rotação de chave, etc.).
 */
const IGNORED_CONTENT_KEYS = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
]);

/**
 * Converte uma mensagem do Baileys em `InboundMessage`.
 *
 * Devolve `null` quando a mensagem não deve gerar evento: enviada por nós
 * mesmos, status/broadcast, ou puro ruído de protocolo.
 */
export function toInboundMessage(sessionId: string, raw: RawBaileysMessage): InboundMessage | null {
  const key = raw.key;
  const remoteJid = key?.remoteJid;

  if (!key?.id || !remoteJid) {
    return null;
  }

  // Eco das nossas próprias respostas — processá-las criaria um laço.
  if (key.fromMe) {
    return null;
  }

  if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return null;
  }

  const content = unwrapContent(raw.message);

  if (!content) {
    return null;
  }

  const contentKey = findContentKey(content);

  if (!contentKey || IGNORED_CONTENT_KEYS.has(contentKey)) {
    return null;
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? (key.participant ?? remoteJid) : remoteJid;

  return {
    id: key.id,
    sessionId,
    chatId: normalizeJid(remoteJid),
    from: {
      chatId: normalizeJid(senderJid),
      phoneE164: toE164(pickPhoneJid(senderJid, isGroup ? key.participantAlt : key.remoteJidAlt)),
      pushName: raw.pushName ?? null,
    },
    type: TYPE_BY_CONTENT_KEY[contentKey] ?? 'unsupported',
    text: extractText(content),
    quotedMessageId: extractQuotedId(content),
    isGroup,
    timestamp: toIsoTimestamp(raw.messageTimestamp),
  };
}

/** Remove os envelopes (efêmera, ver-uma-vez, editada) até chegar no conteúdo. */
function unwrapContent(content: RawMessageContent | null | undefined): RawMessageContent | null {
  let current = content ?? null;

  // Envelopes podem estar aninhados; o limite evita laço em payload malformado.
  for (let depth = 0; current && depth < 5; depth += 1) {
    const wrapper = WRAPPER_KEYS.find((wrapperKey) => current?.[wrapperKey]);

    if (!wrapper) {
      return current;
    }

    const inner = current[wrapper] as { message?: RawMessageContent | null } | null;
    current = inner?.message ?? null;
  }

  return current;
}

function findContentKey(content: RawMessageContent): string | undefined {
  return Object.keys(content).find(
    (candidate) => content[candidate] !== null && content[candidate] !== undefined,
  );
}

function extractText(content: RawMessageContent): string | null {
  if (typeof content.conversation === 'string' && content.conversation.length > 0) {
    return content.conversation;
  }

  const extended = content.extendedTextMessage?.text;

  if (typeof extended === 'string' && extended.length > 0) {
    return extended;
  }

  // Legendas de mídia contam como texto: uma foto com "isso é normal?" tem
  // conteúdo útil que o agente consegue responder.
  for (const mediaKey of ['imageMessage', 'videoMessage', 'documentMessage'] as const) {
    const caption = (content[mediaKey] as { caption?: string | null } | undefined)?.caption;

    if (typeof caption === 'string' && caption.length > 0) {
      return caption;
    }
  }

  return null;
}

function extractQuotedId(content: RawMessageContent): string | null {
  for (const value of Object.values(content)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }

    const stanzaId = (value as { contextInfo?: RawContextInfo | null }).contextInfo?.stanzaId;

    if (typeof stanzaId === 'string' && stanzaId.length > 0) {
      return stanzaId;
    }
  }

  return null;
}

/**
 * Remove o sufixo de dispositivo/agente do JID (`:12@` → `@`).
 *
 * Sem isso, a mesma pessoa falando de dois aparelhos vira dois chats
 * diferentes — e a memória da conversa no n8n se parte ao meio.
 */
export function normalizeJid(jid: string): string {
  const [user = '', domain] = jid.split('@');

  if (!domain) {
    return jid;
  }

  return `${user.split(':')[0]}@${domain}`;
}

/**
 * Escolhe o JID que de fato carrega um número de telefone.
 *
 * Com endereçamento LID, o `remoteJid` pode ser um identificador opaco
 * (`...@lid`) e o número real vir no campo `*Alt`.
 */
function pickPhoneJid(primary: string, alternative: string | null | undefined): string | null {
  for (const candidate of [primary, alternative]) {
    if (candidate && /@(s\.whatsapp\.net|c\.us)$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function toE164(jid: string | null): string | null {
  if (!jid) {
    return null;
  }

  const digits = normalizeJid(jid).split('@')[0]?.replace(/\D/g, '');

  return digits ? `+${digits}` : null;
}

function toIsoTimestamp(timestamp: RawBaileysMessage['messageTimestamp']): string {
  if (typeof timestamp === 'number') {
    return new Date(timestamp * 1000).toISOString();
  }

  if (timestamp && typeof timestamp.toNumber === 'function') {
    return new Date(timestamp.toNumber() * 1000).toISOString();
  }

  return new Date().toISOString();
}
