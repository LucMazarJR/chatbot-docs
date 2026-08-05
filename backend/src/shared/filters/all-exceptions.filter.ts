import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CorrelationService } from '@/shared/correlation/correlation.service';

/** A partir daqui o erro é nosso, não do cliente — vira log de erro. */
const SERVER_ERROR_THRESHOLD = 500;

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId?: string;
  timestamp: string;
  path: string;
}

/**
 * Resposta de erro uniforme e sem vazamento.
 *
 * Erros inesperados viram sempre 500 com mensagem genérica: stack trace e
 * detalhe interno vão para o log (com o correlationId), nunca para o cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger,
    private readonly correlation: CorrelationService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      statusCode: status,
      error: isHttp ? exception.name : 'InternalServerError',
      message: isHttp
        ? extractMessage(exception)
        : 'Erro interno. Consulte o correlationId nos logs.',
      correlationId: this.correlation.current,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error({ err: exception, path: request.url, status }, 'Erro não tratado');
    } else {
      this.logger.warn(
        { path: request.url, status, message: body.message },
        'Requisição rejeitada',
      );
    }

    response.status(status).json(body);
  }
}

function extractMessage(exception: HttpException): string | string[] {
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return payload;
  }

  const message = (payload as { message?: unknown }).message;

  if (typeof message === 'string' || Array.isArray(message)) {
    return message as string | string[];
  }

  return exception.message;
}
