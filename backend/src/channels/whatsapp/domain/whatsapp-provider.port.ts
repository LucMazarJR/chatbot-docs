import type { OutboundTextMessage } from './message.types';
import type { SessionSnapshot } from './session.types';
import type { WhatsAppEventHandler } from './whatsapp-event.types';

/**
 * Porta de saída para o canal WhatsApp.
 *
 * É a peça que dá sentido a todo o resto: a Fase 1 entrega um adapter Baileys
 * (não-oficial, o mesmo motor que o WAHA usava por baixo), e a migração futura
 * para a WhatsApp Cloud API oficial da Meta é escrever um segundo adapter
 * — sem tocar em `inbound/`, `outbound/`, `sessions/` ou `webhooks/`.
 *
 * Por isso é `abstract class` e não `interface`: serve como token de injeção
 * do Nest sem precisar de um símbolo separado.
 */
export abstract class WhatsAppProvider {
  /** Conecta (ou reconecta) a sessão. Idempotente. */
  abstract connect(sessionId: string): Promise<void>;

  /** Encerra o socket sem desvincular o aparelho. */
  abstract disconnect(sessionId: string): Promise<void>;

  /** Desvincula o aparelho e descarta as credenciais. Exige novo QR code. */
  abstract logout(sessionId: string): Promise<void>;

  abstract getSnapshot(sessionId: string): SessionSnapshot;

  /** QR code atual como data URL PNG, ou `null` se não houver QR pendente. */
  abstract getQrCode(sessionId: string): string | null;

  /** Envia texto e devolve o id da mensagem no WhatsApp. */
  abstract sendText(message: OutboundTextMessage): Promise<string>;

  /**
   * Confirma se o JID corresponde a uma conta de WhatsApp existente.
   *
   * Devolve `null` quando não foi possível verificar (socket fora do ar, erro
   * na consulta). Quem chama decide o que fazer com a incerteza — aqui a
   * escolha é seguir com o envio, porque bloquear uma mensagem legítima é pior
   * do que deixar passar um número errado.
   */
  abstract isRegistered(sessionId: string, jid: string): Promise<boolean | null>;

  /** Presença "digitando..." — parte da estratégia anti-ban. */
  abstract sendTyping(sessionId: string, chatId: string, durationMs: number): Promise<void>;

  /** Marca como lida a última mensagem recebida do chat. */
  abstract markAsRead(sessionId: string, chatId: string, messageId: string): Promise<void>;

  /** Registra o consumidor dos eventos do canal. */
  abstract onEvent(handler: WhatsAppEventHandler): void;
}
