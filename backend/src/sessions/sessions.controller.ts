import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post(':sessionId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conecta a sessão. Idempotente.' })
  @ApiParam({ name: 'sessionId', example: 'default' })
  @ApiOkResponse({ type: SessionResponseDto })
  async start(@Param('sessionId') sessionId: string): Promise<SessionResponseDto> {
    return SessionResponseDto.from(await this.sessions.start(sessionId));
  }

  @Post(':sessionId/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerra o socket sem desvincular o aparelho.' })
  @ApiOkResponse({ type: SessionResponseDto })
  async stop(@Param('sessionId') sessionId: string): Promise<SessionResponseDto> {
    return SessionResponseDto.from(await this.sessions.stop(sessionId));
  }

  @Delete(':sessionId')
  @ApiOperation({
    summary: 'Desvincula o aparelho e apaga as credenciais. Exige novo QR code.',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  async logout(@Param('sessionId') sessionId: string): Promise<SessionResponseDto> {
    return SessionResponseDto.from(await this.sessions.logout(sessionId));
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Estado atual da sessão.' })
  @ApiOkResponse({ type: SessionResponseDto })
  get(@Param('sessionId') sessionId: string): SessionResponseDto {
    return SessionResponseDto.from(this.sessions.getSnapshot(sessionId));
  }

  /**
   * `?format=png` devolve a imagem direto, para abrir no navegador e escanear —
   * é o caminho que substitui o dashboard do WAHA no pareamento.
   */
  @Get(':sessionId/qr')
  @ApiOperation({ summary: 'QR code pendente de pareamento (JSON data URL ou PNG).' })
  getQrCode(
    @Param('sessionId') sessionId: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): void {
    const dataUrl = this.sessions.getQrCode(sessionId);

    if (format !== 'png') {
      res.json({ sessionId, qr: dataUrl });
      return;
    }

    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(base64, 'base64'));
  }
}
