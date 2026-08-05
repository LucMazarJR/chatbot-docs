import { normalizeJid, toInboundMessage, type RawBaileysMessage } from './baileys-event.mapper';

const SESSION = 'default';
const TIMESTAMP = 1_785_000_000;

function build(overrides: Partial<RawBaileysMessage> = {}): RawBaileysMessage {
  return {
    key: { remoteJid: '5516999998888@s.whatsapp.net', fromMe: false, id: 'MSG-1' },
    message: { conversation: 'quais exames precisam de jejum?' },
    messageTimestamp: TIMESTAMP,
    pushName: 'Maria',
    ...overrides,
  };
}

describe('toInboundMessage', () => {
  it('normaliza uma mensagem de texto simples', () => {
    const result = toInboundMessage(SESSION, build());

    expect(result).toEqual({
      id: 'MSG-1',
      sessionId: SESSION,
      chatId: '5516999998888@s.whatsapp.net',
      from: {
        chatId: '5516999998888@s.whatsapp.net',
        phoneE164: '+5516999998888',
        pushName: 'Maria',
      },
      type: 'text',
      text: 'quais exames precisam de jejum?',
      quotedMessageId: null,
      isGroup: false,
      timestamp: new Date(TIMESTAMP * 1000).toISOString(),
    });
  });

  it('extrai texto e mensagem citada de extendedTextMessage', () => {
    const result = toInboundMessage(
      SESSION,
      build({
        message: {
          extendedTextMessage: {
            text: 'e sobre o jejum?',
            contextInfo: { stanzaId: 'MSG-ANTERIOR' },
          },
        },
      }),
    );

    expect(result?.text).toBe('e sobre o jejum?');
    expect(result?.quotedMessageId).toBe('MSG-ANTERIOR');
    expect(result?.type).toBe('text');
  });

  it('usa a legenda da imagem como texto', () => {
    const result = toInboundMessage(
      SESSION,
      build({ message: { imageMessage: { caption: 'isso é normal?' } } }),
    );

    expect(result?.type).toBe('image');
    expect(result?.text).toBe('isso é normal?');
  });

  it('classifica áudio sem texto', () => {
    const result = toInboundMessage(SESSION, build({ message: { audioMessage: { seconds: 5 } } }));

    expect(result?.type).toBe('audio');
    expect(result?.text).toBeNull();
  });

  it('descasca envelope de mensagem efêmera', () => {
    const result = toInboundMessage(
      SESSION,
      build({ message: { ephemeralMessage: { message: { conversation: 'oi' } } } }),
    );

    expect(result?.type).toBe('text');
    expect(result?.text).toBe('oi');
  });

  it('descasca envelope de ver-uma-vez aninhado', () => {
    const result = toInboundMessage(
      SESSION,
      build({
        message: {
          ephemeralMessage: {
            message: { viewOnceMessageV2: { message: { imageMessage: { caption: 'olha' } } } },
          },
        },
      }),
    );

    expect(result?.type).toBe('image');
    expect(result?.text).toBe('olha');
  });

  describe('mensagens que não devem virar evento', () => {
    it('ignora mensagens enviadas por nós mesmos', () => {
      const raw = build();
      raw.key!.fromMe = true;

      // Sem isto, cada resposta do bot dispararia um novo webhook — laço infinito.
      expect(toInboundMessage(SESSION, raw)).toBeNull();
    });

    it('ignora status/broadcast', () => {
      const raw = build();
      raw.key!.remoteJid = 'status@broadcast';

      expect(toInboundMessage(SESSION, raw)).toBeNull();
    });

    it('ignora ruído de protocolo', () => {
      expect(
        toInboundMessage(SESSION, build({ message: { protocolMessage: { type: 0 } } })),
      ).toBeNull();
    });

    it('ignora mensagem sem id ou sem remetente', () => {
      expect(toInboundMessage(SESSION, build({ key: { remoteJid: null, id: null } }))).toBeNull();
    });

    it('ignora mensagem sem conteúdo', () => {
      expect(toInboundMessage(SESSION, build({ message: null }))).toBeNull();
    });
  });

  describe('endereçamento', () => {
    it('identifica grupo e usa o participante como remetente', () => {
      const result = toInboundMessage(
        SESSION,
        build({
          key: {
            remoteJid: '120363000000000000@g.us',
            participant: '5516988887777@s.whatsapp.net',
            fromMe: false,
            id: 'MSG-G',
          },
        }),
      );

      expect(result?.isGroup).toBe(true);
      expect(result?.chatId).toBe('120363000000000000@g.us');
      expect(result?.from.chatId).toBe('5516988887777@s.whatsapp.net');
      expect(result?.from.phoneE164).toBe('+5516988887777');
    });

    it('extrai o telefone de remoteJidAlt quando o JID é LID', () => {
      // Endereçamento LID: `remoteJid` é opaco e o número real vem no campo
      // `*Alt`. Era esse campo cru que o fluxo do n8n lia direto.
      const result = toInboundMessage(
        SESSION,
        build({
          key: {
            remoteJid: '123456789@lid',
            remoteJidAlt: '5516999998888@s.whatsapp.net',
            fromMe: false,
            id: 'MSG-LID',
          },
        }),
      );

      expect(result?.chatId).toBe('123456789@lid');
      expect(result?.from.phoneE164).toBe('+5516999998888');
    });

    it('devolve phoneE164 nulo quando não há JID de telefone', () => {
      const result = toInboundMessage(
        SESSION,
        build({ key: { remoteJid: '123456789@lid', fromMe: false, id: 'MSG-LID2' } }),
      );

      expect(result?.from.phoneE164).toBeNull();
    });

    it('remove o sufixo de dispositivo do JID', () => {
      // Sem isso, a mesma pessoa em dois aparelhos vira dois chats — e a
      // memória da conversa no n8n se parte ao meio.
      const result = toInboundMessage(
        SESSION,
        build({ key: { remoteJid: '5516999998888:12@s.whatsapp.net', fromMe: false, id: 'M' } }),
      );

      expect(result?.chatId).toBe('5516999998888@s.whatsapp.net');
    });
  });

  it('aceita timestamp no formato Long do protobuf', () => {
    const result = toInboundMessage(
      SESSION,
      build({ messageTimestamp: { toNumber: () => TIMESTAMP } }),
    );

    expect(result?.timestamp).toBe(new Date(TIMESTAMP * 1000).toISOString());
  });
});

describe('normalizeJid', () => {
  it.each([
    ['5516999998888:12@s.whatsapp.net', '5516999998888@s.whatsapp.net'],
    ['5516999998888@s.whatsapp.net', '5516999998888@s.whatsapp.net'],
    ['120363000000000000@g.us', '120363000000000000@g.us'],
    ['sem-arroba', 'sem-arroba'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeJid(input)).toBe(expected);
  });
});
