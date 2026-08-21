import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import pino from 'pino';
import * as QRCode from 'qrcode';

import { AuthStateRepository } from '@/channels/whatsapp/domain/auth-state.repository.port';
import type { OutboundTextMessage } from '@/channels/whatsapp/domain/message.types';
import type { SessionSnapshot, SessionStatus } from '@/channels/whatsapp/domain/session.types';
import type {
  WhatsAppEvent,
  WhatsAppEventHandler,
} from '@/channels/whatsapp/domain/whatsapp-event.types';
import { WhatsAppProvider } from '@/channels/whatsapp/domain/whatsapp-provider.port';
import { SessionNotConnectedError } from '@/channels/whatsapp/domain/whatsapp.errors';
import { TypedConfigService } from '@/config/typed-config.service';
import { CorrelationService } from '@/shared/correlation/correlation.service';

import { toInboundMessage, type RawBaileysMessage } from './baileys-event.mapper';

/**
 * O Baileys 6.7+ é ESM puro e a aplicação é CommonJS, então ele só pode ser
 * carregado por `import()` dinâmico. O módulo é cacheado após a primeira carga.
 *
 * Os tipos são derivados da própria expressão de import — assim o arquivo não
 * precisa do atributo `resolution-mode` que um `import type` de pacote ESM
 * exigiria em módulo CommonJS.
 */
const importBaileys = () => import('@whiskeysockets/baileys');

type BaileysModule = Awaited<ReturnType<typeof importBaileys>>;
type WASocket = ReturnType<BaileysModule['makeWASocket']>;

let cachedModule: BaileysModule | null = null;

async function loadBaileys(): Promise<BaileysModule> {
  cachedModule ??= await importBaileys();

  return cachedModule;
}

interface SessionRuntime {
  socket: WASocket | null;
  status: SessionStatus;
  phoneE164: string | null;
  connectedAt: string | null;
  reconnectAttempts: number;
  lastError: string | null;
  qrDataUrl: string | null;
  /** Conexão em andamento — evita dois sockets para a mesma sessão. */
  starting: Promise<void> | null;
  /** Distingue desconexão pedida por nós de queda real. */
  shuttingDown: boolean;
  reconnectTimer: NodeJS.Timeout | null;
}

const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

@Injectable()
export class BaileysProvider extends WhatsAppProvider implements OnModuleDestroy {
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly handlers: WhatsAppEventHandler[] = [];

  /** Logger silencioso: o Baileys é extremamente verboso em nível debug. */
  private readonly baileysLogger = pino({ level: 'silent' });

  constructor(
    @InjectPinoLogger(BaileysProvider.name) private readonly logger: PinoLogger,
    private readonly config: TypedConfigService,
    private readonly authState: AuthStateRepository,
    private readonly correlation: CorrelationService,
  ) {
    super();
  }

  onEvent(handler: WhatsAppEventHandler): void {
    this.handlers.push(handler);
  }

  async connect(sessionId: string): Promise<void> {
    const runtime = this.runtimeFor(sessionId);

    if (runtime.status === 'CONNECTED') {
      return;
    }

    // Chamadas concorrentes compartilham a mesma promessa em vez de abrir
    // um segundo socket, o que derrubaria o primeiro.
    runtime.starting ??= this.openSocket(sessionId).finally(() => {
      runtime.starting = null;
    });

    return runtime.starting;
  }

  async disconnect(sessionId: string): Promise<void> {
    const runtime = this.sessions.get(sessionId);

    if (!runtime) {
      return;
    }

    runtime.shuttingDown = true;
    this.cancelReconnect(runtime);

    try {
      runtime.socket?.end(undefined);
    } finally {
      runtime.socket = null;
      await this.setStatus(sessionId, 'DISCONNECTED');
    }
  }

  async logout(sessionId: string): Promise<void> {
    const runtime = this.sessions.get(sessionId);

    if (runtime) {
      runtime.shuttingDown = true;
    }

    this.cancelReconnect(runtime);

    try {
      await runtime?.socket?.logout();
    } catch (error) {
      // Se o socket já caiu, o logout remoto falha — as credenciais locais
      // ainda precisam sumir, senão o próximo boot tenta reusar sessão morta.
      this.logger.warn({ err: error, sessionId }, 'Logout remoto falhou; limpando credenciais');
    }

    runtime?.socket?.end(undefined);

    if (runtime) {
      runtime.socket = null;
      runtime.qrDataUrl = null;
      runtime.phoneE164 = null;
      runtime.connectedAt = null;
    }

    await this.authState.clear(sessionId);
    await this.setStatus(sessionId, 'LOGGED_OUT');
  }

  getSnapshot(sessionId: string): SessionSnapshot {
    const runtime = this.sessions.get(sessionId);

    return {
      sessionId,
      status: runtime?.status ?? 'DISCONNECTED',
      phoneE164: runtime?.phoneE164 ?? null,
      connectedAt: runtime?.connectedAt ?? null,
      reconnectAttempts: runtime?.reconnectAttempts ?? 0,
      lastError: runtime?.lastError ?? null,
    };
  }

  getQrCode(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.qrDataUrl ?? null;
  }

  async sendText(message: OutboundTextMessage): Promise<string> {
    const socket = this.requireSocket(message.sessionId);
    const quoted = message.replyTo
      ? { key: { id: message.replyTo, remoteJid: message.to, fromMe: false }, message: {} }
      : undefined;

    const sent = await socket.sendMessage(message.to, { text: message.text }, { quoted });

    if (!sent?.key?.id) {
      throw new Error('O WhatsApp não devolveu o id da mensagem enviada.');
    }

    return sent.key.id;
  }

  async sendTyping(sessionId: string, chatId: string, durationMs: number): Promise<void> {
    const socket = this.requireSocket(sessionId);

    await socket.sendPresenceUpdate('composing', chatId);
    await delay(durationMs);
    await socket.sendPresenceUpdate('paused', chatId);
  }

  async markAsRead(sessionId: string, chatId: string, messageId: string): Promise<void> {
    const socket = this.requireSocket(sessionId);

    await socket.readMessages([{ id: messageId, remoteJid: chatId, fromMe: false }]);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.disconnect(sessionId)));
  }

  // ---------------------------------------------------------------- internals

  private async openSocket(sessionId: string): Promise<void> {
    const baileys = await loadBaileys();
    const runtime = this.runtimeFor(sessionId);

    runtime.shuttingDown = false;
    await this.setStatus(sessionId, 'STARTING');

    const folder = await this.authState.resolveStoragePath(sessionId);
    const { state, saveCreds } = await baileys.useMultiFileAuthState(folder);
    const { version } = await baileys.fetchLatestBaileysVersion();

    const socket = baileys.makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: baileys.makeCacheableSignalKeyStore(state.keys, this.baileysLogger),
      },
      logger: this.baileysLogger,
      browser: baileys.Browsers.ubuntu('Chrome'),
      // Não marcar como online: o celular continua recebendo as notificações
      // normalmente, o que importa quando o número é atendido por humanos também.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    runtime.socket = socket;

    socket.ev.on('creds.update', () => {
      void saveCreds();
    });

    socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(sessionId, update, baileys);
    });

    socket.ev.on('messages.upsert', (upsert) => {
      // `notify` = mensagem nova de verdade. `append`/`prepend` são sincronização
      // de histórico e reprocessá-las responderia a conversas antigas.
      if (upsert.type !== 'notify') {
        return;
      }

      void this.handleIncomingMessages(sessionId, upsert.messages as RawBaileysMessage[]);
    });

    this.logger.info({ sessionId, waVersion: version.join('.') }, 'Socket do WhatsApp iniciado');
  }

  private async handleConnectionUpdate(
    sessionId: string,
    update: { connection?: string; lastDisconnect?: { error?: Error } | null; qr?: string },
    baileys: BaileysModule,
  ): Promise<void> {
    const runtime = this.runtimeFor(sessionId);

    if (update.qr) {
      runtime.qrDataUrl = await QRCode.toDataURL(update.qr);
      await this.setStatus(sessionId, 'QR');

      if (!this.config.isProduction) {
        const ascii = await QRCode.toString(update.qr, { type: 'terminal', small: true });
        this.logger.info(`QR code da sessão "${sessionId}":\n${ascii}`);
      } else {
        this.logger.info({ sessionId }, 'QR code disponível em GET /api/v1/sessions/:id/qr');
      }
    }

    if (update.connection === 'open') {
      runtime.qrDataUrl = null;
      runtime.reconnectAttempts = 0;
      runtime.lastError = null;
      runtime.connectedAt = new Date().toISOString();
      runtime.phoneE164 = extractOwnNumber(runtime.socket);

      await this.setStatus(sessionId, 'CONNECTED');
      this.logger.info({ sessionId, phoneE164: runtime.phoneE164 }, 'WhatsApp conectado');

      return;
    }

    if (update.connection === 'close') {
      await this.handleDisconnect(sessionId, update.lastDisconnect?.error, baileys);
    }
  }

  private async handleDisconnect(
    sessionId: string,
    error: Error | undefined,
    baileys: BaileysModule,
  ): Promise<void> {
    const runtime = this.runtimeFor(sessionId);

    runtime.socket = null;
    runtime.lastError = error?.message ?? null;

    if (runtime.shuttingDown) {
      await this.setStatus(sessionId, 'DISCONNECTED');
      return;
    }

    const statusCode = extractStatusCode(error);

    // Sessão desvinculada no celular: reconectar é inútil e só gera ruído.
    // Exige QR novo, portanto intervenção humana.
    if (statusCode === baileys.DisconnectReason.loggedOut) {
      await this.authState.clear(sessionId);
      await this.setStatus(sessionId, 'LOGGED_OUT');

      // Este é o evento mais destrutivo do sistema: apaga as credenciais e
      // obriga alguém a ler um QR code novo. Logar só o sessionId deixava a
      // pessoa sem saber SE foi desvinculação de verdade no celular ou o
      // `Stream Errored (conflict)` de outro aparelho pendurado em "Aparelhos
      // conectados" — que o Baileys também reporta como loggedOut, e cuja
      // solução é completamente diferente.
      this.logger.error(
        { sessionId, statusCode, motivo: error?.message ?? 'sem detalhe' },
        'Sessão desvinculada no aparelho. É preciso ler o QR code.',
      );

      return;
    }

    await this.setStatus(sessionId, 'DISCONNECTED');
    this.scheduleReconnect(sessionId, runtime);
  }

  /** Backoff exponencial com teto — não martelar o WhatsApp durante uma queda. */
  private scheduleReconnect(sessionId: string, runtime: SessionRuntime): void {
    this.cancelReconnect(runtime);

    runtime.reconnectAttempts += 1;
    const delayMs = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (runtime.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );

    this.logger.warn(
      { sessionId, attempt: runtime.reconnectAttempts, delayMs, lastError: runtime.lastError },
      'Conexão caiu; reconectando',
    );

    runtime.reconnectTimer = setTimeout(() => {
      runtime.reconnectTimer = null;
      void this.connect(sessionId).catch((reconnectError: unknown) => {
        this.logger.error({ err: reconnectError, sessionId }, 'Falha ao reconectar');
        this.scheduleReconnect(sessionId, runtime);
      });
    }, delayMs);

    // Um timer pendente não deve segurar o processo no shutdown.
    runtime.reconnectTimer.unref();
  }

  private cancelReconnect(runtime: SessionRuntime | undefined): void {
    if (runtime?.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }
  }

  private async handleIncomingMessages(
    sessionId: string,
    messages: RawBaileysMessage[],
  ): Promise<void> {
    for (const raw of messages) {
      const message = toInboundMessage(sessionId, raw);

      if (!message) {
        continue;
      }

      await this.correlation.runWith(undefined, () =>
        this.emit({ kind: 'message.received', message }),
      );
    }
  }

  private async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const runtime = this.runtimeFor(sessionId);

    if (runtime.status === status) {
      return;
    }

    runtime.status = status;

    if (status !== 'CONNECTED') {
      runtime.connectedAt = null;
    }

    await this.emit({
      kind: 'session.status',
      sessionId,
      status,
      phoneE164: runtime.phoneE164,
    });
  }

  /**
   * Notifica os assinantes sem deixar que a falha de um derrube o socket:
   * o WhatsApp não pode cair porque o n8n está fora do ar.
   */
  private async emit(event: WhatsAppEvent): Promise<void> {
    await Promise.all(
      this.handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          this.logger.error({ err: error, kind: event.kind }, 'Handler de evento falhou');
        }
      }),
    );
  }

  private runtimeFor(sessionId: string): SessionRuntime {
    let runtime = this.sessions.get(sessionId);

    if (!runtime) {
      runtime = {
        socket: null,
        status: 'DISCONNECTED',
        phoneE164: null,
        connectedAt: null,
        reconnectAttempts: 0,
        lastError: null,
        qrDataUrl: null,
        starting: null,
        shuttingDown: false,
        reconnectTimer: null,
      };

      this.sessions.set(sessionId, runtime);
    }

    return runtime;
  }

  private requireSocket(sessionId: string): WASocket {
    const runtime = this.sessions.get(sessionId);

    if (!runtime?.socket || runtime.status !== 'CONNECTED') {
      throw new SessionNotConnectedError(sessionId, runtime?.status ?? 'DISCONNECTED');
    }

    return runtime.socket;
  }
}

function extractOwnNumber(socket: WASocket | null): string | null {
  const id = socket?.user?.id;

  if (!id) {
    return null;
  }

  const digits = id.split('@')[0]?.split(':')[0]?.replace(/\D/g, '');

  return digits ? `+${digits}` : null;
}

/** O Baileys entrega erros do Boom, cujo status fica em `output.statusCode`. */
function extractStatusCode(error: unknown): number | undefined {
  const output = (error as { output?: { statusCode?: number } } | undefined)?.output;

  return output?.statusCode;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
