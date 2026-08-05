import { Module } from '@nestjs/common';

import { WhatsAppModule } from '@/channels/whatsapp/whatsapp.module';

import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
