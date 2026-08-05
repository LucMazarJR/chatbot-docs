import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { firstValueFrom } from 'rxjs';

import { TypedConfigService } from '@/config/typed-config.service';
import { CorrelationService } from '@/shared/correlation/correlation.service';
import { HmacService } from '@/shared/crypto/hmac.service';

import type { AnyWebhookEnvelope } from './contracts/webhook-envelope';

const RETRY_BASE_DELAY_MS = 500;

/**
 * Entrega os eventos do WhatsApp ao webhook do n8n.
 *
 * Envia dois cabeçalhos de autenticidade de propósito:
 * - `X-Webhook-Token`, validado hoje pela credencial Header Auth nativa do n8n;
 * - `X-Signature-256` (HMAC do corpo), que o n8n ainda não confere.
 *
 * Assinar desde já significa que ligar a verificação de assinatura na Fase 2 é
 * mudança só do lado do n8n, sem redeploy do gateway.
 */
@Injectable()
export class N8nDispatcherService {
  constructor(
    @InjectPinoLogger(N8nDispatcherService.name) private readonly logger: PinoLogger,
    private readonly http: HttpService,
    private readonly config: TypedConfigService,
    private readonly hmac: HmacService,
    private readonly correlation: CorrelationService,
  ) {}

  /**
   * Entrega com retry e backoff exponencial.
   *
   * Não lança: uma falha de entrega ao n8n não pode propagar para o socket do
   * WhatsApp. O evento perdido fica registrado no log com o `eventId` — a
   * garantia de entrega de verdade (outbox transacional) é da Fase 2, e isso
   * está documentado como limitação conhecida.
   */
  async dispatch(envelope: AnyWebhookEnvelope): Promise<boolean> {
    const body = JSON.stringify(envelope);
    const maxRetries = this.config.get('N8N_WEBHOOK_MAX_RETRIES');

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        await this.post(body);

        this.logger.info(
          { eventId: envelope.eventId, type: envelope.type, attempt },
          'Evento entregue ao n8n',
        );

        return true;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt || !isRetryable(error)) {
          this.logger.error(
            { err: error, eventId: envelope.eventId, type: envelope.type, attempt },
            'Evento NÃO entregue ao n8n',
          );

          return false;
        }

        const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;

        this.logger.warn(
          { eventId: envelope.eventId, attempt, delayMs, status: statusOf(error) },
          'Falha ao entregar; tentando de novo',
        );

        await delay(delayMs);
      }
    }

    return false;
  }

  private async post(body: string): Promise<void> {
    await firstValueFrom(
      this.http.post(this.config.get('N8N_WEBHOOK_URL'), body, {
        timeout: this.config.get('N8N_WEBHOOK_TIMEOUT_MS'),
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': this.config.get('N8N_WEBHOOK_TOKEN'),
          'X-Signature-256': this.hmac.sign(body, this.config.get('N8N_WEBHOOK_SECRET')),
          ...(this.correlation.current ? { 'X-Correlation-Id': this.correlation.current } : {}),
        },
      }),
    );
  }
}

/**
 * 4xx (exceto 429) não adianta repetir — é contrato ou credencial errada, e
 * insistir só multiplica o erro.
 */
function isRetryable(error: unknown): boolean {
  const status = statusOf(error);

  if (status === undefined) {
    return true; // timeout, DNS, conexão recusada
  }

  return status === 429 || status >= 500;
}

function statusOf(error: unknown): number | undefined {
  return error instanceof AxiosError ? error.response?.status : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
