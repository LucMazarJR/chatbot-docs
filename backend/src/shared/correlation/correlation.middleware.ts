import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { CorrelationService } from './correlation.service';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Abre um escopo de correlação para cada requisição HTTP, reaproveitando o
 * `X-Correlation-Id` que o chamador enviou (o n8n devolve o mesmo id que
 * recebeu no webhook, então o log liga a mensagem recebida à resposta enviada).
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly correlation: CorrelationService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[CORRELATION_HEADER];
    const correlationId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();

    res.setHeader(CORRELATION_HEADER, correlationId);
    this.correlation.runWith(correlationId, () => next());
  }
}
