import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** Limite de uma mensagem de texto do WhatsApp. */
export const MAX_TEXT_LENGTH = 4096;

export class SendMessageDto {
  @ApiPropertyOptional({
    example: 'default',
    description: 'Omitido, usa a sessão padrão (WA_SESSION_ID).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @ApiProperty({
    example: '5516999998888@s.whatsapp.net',
    description: 'JID do WhatsApp ou número em E.164 — ambos são aceitos.',
  })
  @IsString()
  @Length(5, 128)
  to: string;

  @ApiPropertyOptional({ enum: ['text'], default: 'text' })
  @IsOptional()
  @IsIn(['text'], { message: 'A Fase 1 envia apenas mensagens de texto.' })
  type?: 'text';

  @ApiProperty({ example: 'Para o exame de zinco: *jejum* de 8 horas.' })
  @IsString()
  @Length(1, MAX_TEXT_LENGTH)
  text: string;

  @ApiPropertyOptional({ description: 'Id da mensagem a ser citada na resposta.' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  replyTo?: string;

  @ApiPropertyOptional({
    description:
      'Reenvios com a mesma chave não geram nova mensagem. Use o `eventId` recebido no webhook.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
