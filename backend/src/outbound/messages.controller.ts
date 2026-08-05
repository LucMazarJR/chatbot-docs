import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { SendMessageDto } from './dto/send-message.dto';
import { SendMessageResponseDto } from './dto/send-message-response.dto';
import { OutboundService } from './outbound.service';

@ApiTags('messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly outbound: OutboundService) {}

  /**
   * Substitui o `POST /api/sendText` do WAHA.
   *
   * A requisição só responde depois que a mensagem foi entregue ao WhatsApp:
   * como o envio passa pela fila anti-ban (atraso aleatório + "digitando"),
   * espere alguns segundos de latência. É proposital — o n8n recebe o id real
   * da mensagem e o erro real, em vez de um "ok" que não significa nada.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Envia uma mensagem de texto pelo WhatsApp.' })
  @ApiResponse({ status: 202, type: SendMessageResponseDto })
  @ApiResponse({ status: 401, description: 'X-Api-Key ausente ou inválida.' })
  @ApiResponse({ status: 503, description: 'Sessão não conectada — tente de novo mais tarde.' })
  send(@Body() dto: SendMessageDto): Promise<SendMessageResponseDto> {
    return this.outbound.sendText(dto);
  }
}
