import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HmacService } from '@/shared/crypto/hmac.service';

import { N8nDispatcherService } from './n8n-dispatcher.service';

@Module({
  // O timeout real por requisição é definido no dispatcher a partir da config;
  // aqui vale só como rede de segurança do cliente HTTP.
  imports: [HttpModule.register({ timeout: 30_000, maxRedirects: 0 })],
  providers: [N8nDispatcherService, HmacService],
  exports: [N8nDispatcherService],
})
export class WebhooksModule {}
