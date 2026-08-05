import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

/**
 * Assinatura HMAC-SHA256 dos webhooks entregues ao n8n.
 *
 * O gateway já assina desde a Fase 1, mesmo que o n8n ainda valide apenas o
 * `X-Webhook-Token`: assim, ligar a verificação de assinatura na Fase 2 é
 * mudança só do lado do n8n, sem redeploy do backend.
 */
@Injectable()
export class HmacService {
  /** Formato `sha256=<hex>`, o mesmo que GitHub e Stripe usam. */
  sign(payload: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
  }

  verify(payload: string, secret: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload, secret));
    const received = Buffer.from(signature);

    if (expected.length !== received.length) {
      return false;
    }

    return timingSafeEqual(expected, received);
  }
}
