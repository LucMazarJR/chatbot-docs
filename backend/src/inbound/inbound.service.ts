import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { InboundMessage } from '@/channels/whatsapp/domain/message.types';
import type { WhatsAppEvent } from '@/channels/whatsapp/domain/whatsapp-event.types';
import { WhatsAppProvider } from '@/channels/whatsapp/domain/whatsapp-provider.port';
import { TypedConfigService } from '@/config/typed-config.service';
import { toInboundMessagePayload } from '@/webhooks/contracts/webhook-envelope';
import { N8nDispatcherService } from '@/webhooks/n8n-dispatcher.service';

import { DedupeService } from './dedupe.service';

/**
 * Pipeline de entrada: evento do canal → dedupe → envelope canônico → n8n.
 *
 * O que antes era responsabilidade dividida entre o WAHA (que só repassava o
 * payload cru) e o nó `Dados` do n8n (que cavava dentro dele) agora acontece
 * aqui, com tipo e teste.
 */
@Injectable()
export class InboundService implements OnModuleInit {
  constructor(
    @InjectPinoLogger(InboundService.name) private readonly logger: PinoLogger,
    private readonly provider: WhatsAppProvider,
    private readonly dedupe: DedupeService,
    private readonly dispatcher: N8nDispatcherService,
    private readonly config: TypedConfigService,
  ) {}

  onModuleInit(): void {
    this.provider.onEvent((event) => this.handle(event));
  }

  private async handle(event: WhatsAppEvent): Promise<void> {
    if (event.kind === 'session.status') {
      await this.dispatcher.dispatch({
        eventId: randomUUID(),
        type: 'session.status',
        occurredAt: new Date().toISOString(),
        sessionId: event.sessionId,
        status: event.status,
        phoneE164: event.phoneE164,
      });

      return;
    }

    await this.handleMessage(event.message);
  }

  private async handleMessage(message: InboundMessage): Promise<void> {
    // Grupos ficam fora do escopo: o bot é um canal de atendimento 1:1 e
    // responder dentro de grupo é ruído para todos os participantes.
    if (message.isGroup) {
      this.logger.debug({ messageId: message.id }, 'Mensagem de grupo ignorada');
      return;
    }

    const isNew = await this.dedupe.isFirstOccurrence(message.sessionId, message.id);

    if (!isNew) {
      this.logger.info({ messageId: message.id }, 'Mensagem duplicada descartada');
      return;
    }

    // Nunca logar o conteúdo: é dado de saúde de um cidadão identificável.
    this.logger.info(
      {
        messageId: message.id,
        chatId: message.chatId,
        type: message.type,
        textLength: message.text?.length ?? 0,
      },
      'Mensagem recebida',
    );

    if (this.config.get('WA_MARK_AS_READ')) {
      await this.provider
        .markAsRead(message.sessionId, message.chatId, message.id)
        .catch((error: unknown) => {
          // Confirmação de leitura é cosmética — não pode impedir a resposta.
          this.logger.warn({ err: error, messageId: message.id }, 'Falha ao marcar como lida');
        });
    }

    await this.dispatcher.dispatch({
      eventId: randomUUID(),
      type: 'message.received',
      occurredAt: new Date().toISOString(),
      sessionId: message.sessionId,
      message: toInboundMessagePayload(message),
    });
  }
}
