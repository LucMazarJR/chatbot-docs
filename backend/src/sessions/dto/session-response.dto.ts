import { ApiProperty } from '@nestjs/swagger';

import type { SessionSnapshot } from '@/channels/whatsapp/domain/session.types';

export class SessionResponseDto {
  @ApiProperty({ example: 'default' })
  sessionId: string;

  @ApiProperty({
    enum: ['STARTING', 'QR', 'CONNECTED', 'DISCONNECTED', 'LOGGED_OUT'],
    description:
      'LOGGED_OUT exige leitura de novo QR code; DISCONNECTED se recupera sozinho por reconexão automática.',
  })
  status: string;

  @ApiProperty({ example: '+5516999998888', nullable: true })
  phoneE164: string | null;

  @ApiProperty({ example: '2026-08-04T13:22:31.412Z', nullable: true })
  connectedAt: string | null;

  @ApiProperty({ example: 0 })
  reconnectAttempts: number;

  @ApiProperty({ nullable: true })
  lastError: string | null;

  static from(snapshot: SessionSnapshot): SessionResponseDto {
    return { ...snapshot };
  }
}
