import { Module } from '@nestjs/common';

import { WhatsAppModule } from '@/channels/whatsapp/whatsapp.module';

import { HealthController } from './health.controller';

@Module({
  imports: [WhatsAppModule],
  controllers: [HealthController],
})
export class HealthModule {}
