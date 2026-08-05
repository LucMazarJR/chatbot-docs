import { Module } from '@nestjs/common';

import { AuthStateRepository } from './domain/auth-state.repository.port';
import { WhatsAppProvider } from './domain/whatsapp-provider.port';
import { BaileysProvider } from './adapters/baileys/baileys.provider';
import { FileAuthStateRepository } from './adapters/baileys/file-auth-state.repository';

/**
 * Aqui — e só aqui — se escolhe qual implementação do canal está em uso.
 *
 * Trocar para a WhatsApp Cloud API oficial da Meta no futuro é substituir
 * `BaileysProvider` por `CloudApiProvider` nestas duas linhas. Nenhum outro
 * módulo importa o adapter: todos dependem da porta `WhatsAppProvider`.
 */
@Module({
  providers: [
    { provide: AuthStateRepository, useClass: FileAuthStateRepository },
    { provide: WhatsAppProvider, useClass: BaileysProvider },
  ],
  exports: [WhatsAppProvider, AuthStateRepository],
})
export class WhatsAppModule {}
