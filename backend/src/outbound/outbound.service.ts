import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WhatsAppProvider } from '@/channels/whatsapp/domain/whatsapp-provider.port';
import { SessionNotConnectedError } from '@/channels/whatsapp/domain/whatsapp.errors';
import { TypedConfigService } from '@/config/typed-config.service';

import type { SendMessageDto } from './dto/send-message.dto';
import type { SendMessageResponseDto } from './dto/send-message-response.dto';
import { IdempotencyService } from './idempotency.service';
import { SendQueueService } from './send-queue.service';
import { TextFormatterService } from './text-formatter.service';

/** Ritmo de digitação simulado — aproxima uma pessoa digitando de verdade. */
const TYPING_MS_PER_CHAR = 25;

@Injectable()
export class OutboundService {
  constructor(
    @InjectPinoLogger(OutboundService.name) private readonly logger: PinoLogger,
    private readonly provider: WhatsAppProvider,
    private readonly queue: SendQueueService,
    private readonly formatter: TextFormatterService,
    private readonly idempotency: IdempotencyService,
    private readonly config: TypedConfigService,
  ) {}

  async sendText(dto: SendMessageDto): Promise<SendMessageResponseDto> {
    const sessionId = dto.sessionId ?? this.config.get('WA_SESSION_ID');
    const to = normalizeRecipient(dto.to);

    if (dto.idempotencyKey) {
      const existing = await this.idempotency.findExisting(dto.idempotencyKey);

      if (existing) {
        this.logger.info(
          { idempotencyKey: dto.idempotencyKey, messageId: existing },
          'Envio duplicado ignorado',
        );

        return { id: existing, status: 'duplicate', sessionId, to };
      }
    }

    const text = this.formatter.format(dto.text);

    if (text.length === 0) {
      throw new BadRequestException('A mensagem ficou vazia após a formatação.');
    }

    await this.assertRecipientExists(sessionId, dto.to, to);

    const messageId = await this.queue
      .enqueue(sessionId, async () => {
        await this.simulateTyping(sessionId, to, text.length);

        return this.provider.sendText({ sessionId, to, text, replyTo: dto.replyTo });
      })
      .catch((error: unknown) => {
        throw this.translateError(error);
      });

    if (dto.idempotencyKey) {
      await this.idempotency.remember(dto.idempotencyKey, messageId);
    }

    this.logger.info({ messageId, to, textLength: text.length, sessionId }, 'Mensagem enviada');

    return { id: messageId, status: 'sent', sessionId, to };
  }

  /**
   * Recusa envio para número que não existe no WhatsApp.
   *
   * Sem isto, um número malformado recebia `messageId` normalmente e a mensagem
   * simplesmente sumia — sem erro para quem chamou, sem entrega para ninguém.
   *
   * Só verifica quando o destinatário chegou como NÚMERO SOLTO, que é o caminho
   * de teste manual e de digitação errada. Respostas do fluxo chegam como JID
   * (`@lid` ou `@s.whatsapp.net`) vindo do próprio webhook: já são
   * comprovadamente válidos, e verificar cada um custaria uma consulta ao
   * WhatsApp por mensagem respondida.
   */
  private async assertRecipientExists(
    sessionId: string,
    original: string,
    jid: string,
  ): Promise<void> {
    if (original.includes('@')) {
      return;
    }

    const existe = await this.provider.isRegistered(sessionId, jid);

    // `null` = não foi possível verificar. Segue o envio: bloquear uma mensagem
    // legítima por causa de uma consulta que falhou é pior que o problema.
    if (existe === false) {
      throw new BadRequestException(
        `O número ${original} não tem conta no WhatsApp.`,
      );
    }
  }

  private async simulateTyping(sessionId: string, to: string, textLength: number): Promise<void> {
    const durationMs = Math.min(
      textLength * TYPING_MS_PER_CHAR,
      this.config.get('WA_MAX_TYPING_MS'),
    );

    if (durationMs <= 0) {
      return;
    }

    await this.provider.sendTyping(sessionId, to, durationMs).catch((error: unknown) => {
      // A presença é cosmética; falhar nela não pode impedir a resposta.
      this.logger.warn({ err: error, to }, 'Falha ao enviar presença "digitando"');
    });
  }

  /**
   * Sessão desconectada é 503, não 500: é uma condição temporária e esperada
   * (o WhatsApp caiu, o gateway está reconectando), e o n8n pode diferenciar
   * isso de um erro de contrato.
   */
  private translateError(error: unknown): unknown {
    if (error instanceof SessionNotConnectedError) {
      return new ServiceUnavailableException(error.message);
    }

    return error;
  }
}

/**
 * Aceita tanto JID quanto número solto.
 *
 * O n8n devolve o `chatId` que recebeu no webhook (já um JID), mas testes
 * manuais com `curl` costumam mandar só o número — suportar os dois evita uma
 * classe inteira de erro de digitação.
 */
export function normalizeRecipient(to: string): string {
  const trimmed = to.trim();

  if (trimmed.includes('@')) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 0) {
    throw new BadRequestException(`Destinatário inválido: "${to}"`);
  }

  return `${digits}@s.whatsapp.net`;
}
