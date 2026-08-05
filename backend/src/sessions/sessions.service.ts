import { Injectable, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { SessionSnapshot } from '@/channels/whatsapp/domain/session.types';
import { WhatsAppProvider } from '@/channels/whatsapp/domain/whatsapp-provider.port';
import { TypedConfigService } from '@/config/typed-config.service';

@Injectable()
export class SessionsService implements OnApplicationBootstrap {
  constructor(
    @InjectPinoLogger(SessionsService.name) private readonly logger: PinoLogger,
    private readonly provider: WhatsAppProvider,
    private readonly config: TypedConfigService,
  ) {}

  /**
   * Reconecta a sessão padrão no boot.
   *
   * Falhar aqui não pode derrubar a aplicação: se o WhatsApp estiver fora do
   * ar, o gateway ainda precisa subir para servir `/health` e o endpoint de QR
   * — do contrário o container entra em laço de restart e ninguém consegue
   * nem diagnosticar o problema.
   */
  onApplicationBootstrap(): void {
    if (!this.config.get('WA_AUTO_START')) {
      this.logger.info('WA_AUTO_START desligado; a sessão precisa ser iniciada pela API.');
      return;
    }

    const sessionId = this.defaultSessionId;

    void this.provider.connect(sessionId).catch((error: unknown) => {
      this.logger.error({ err: error, sessionId }, 'Falha ao iniciar a sessão no boot');
    });
  }

  get defaultSessionId(): string {
    return this.config.get('WA_SESSION_ID');
  }

  async start(sessionId: string): Promise<SessionSnapshot> {
    await this.provider.connect(sessionId);

    return this.provider.getSnapshot(sessionId);
  }

  async stop(sessionId: string): Promise<SessionSnapshot> {
    await this.provider.disconnect(sessionId);

    return this.provider.getSnapshot(sessionId);
  }

  async logout(sessionId: string): Promise<SessionSnapshot> {
    await this.provider.logout(sessionId);

    return this.provider.getSnapshot(sessionId);
  }

  getSnapshot(sessionId: string): SessionSnapshot {
    return this.provider.getSnapshot(sessionId);
  }

  /**
   * QR code pendente. Ausência de QR não é erro de servidor — significa que a
   * sessão já está conectada ou ainda nem começou a parear.
   */
  getQrCode(sessionId: string): string {
    const qr = this.provider.getQrCode(sessionId);

    if (!qr) {
      const { status } = this.provider.getSnapshot(sessionId);

      throw new NotFoundException(
        `Nenhum QR code pendente para a sessão "${sessionId}" (status: ${status}). ` +
          'O QR só existe enquanto o pareamento está em andamento.',
      );
    }

    return qr;
  }
}
