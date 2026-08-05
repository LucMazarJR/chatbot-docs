import { Module } from '@nestjs/common';

import { WhatsAppModule } from '@/channels/whatsapp/whatsapp.module';
import { WebhooksModule } from '@/webhooks/webhooks.module';

import { DedupeService } from './dedupe.service';
import { InboundService } from './inbound.service';

@Module({
  imports: [WhatsAppModule, WebhooksModule],
  providers: [InboundService, DedupeService],
})
export class InboundModule {}
