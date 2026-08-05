import { Module } from '@nestjs/common';

import { WhatsAppModule } from '@/channels/whatsapp/whatsapp.module';

import { IdempotencyService } from './idempotency.service';
import { MessagesController } from './messages.controller';
import { OutboundService } from './outbound.service';
import { SendQueueService } from './send-queue.service';
import { TextFormatterService } from './text-formatter.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [MessagesController],
  providers: [OutboundService, SendQueueService, TextFormatterService, IdempotencyService],
  exports: [SendQueueService],
})
export class OutboundModule {}
