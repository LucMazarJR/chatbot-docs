import { ApiProperty } from '@nestjs/swagger';

export class SendMessageResponseDto {
  @ApiProperty({ example: '3EB0C767D26B8F3A1B2C', description: 'Id da mensagem no WhatsApp.' })
  id: string;

  @ApiProperty({
    enum: ['sent', 'duplicate'],
    description: '`duplicate` = já havia envio com a mesma `idempotencyKey`; nada foi reenviado.',
  })
  status: 'sent' | 'duplicate';

  @ApiProperty({ example: 'default' })
  sessionId: string;

  @ApiProperty({ example: '5516999998888@s.whatsapp.net' })
  to: string;
}
