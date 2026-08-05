import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

export interface CorrelationStore {
  correlationId: string;
}

/**
 * Propaga o `correlationId` por todo o caminho de uma mensagem sem ter que
 * passá-lo de parâmetro em parâmetro.
 *
 * Existe porque metade do trabalho do gateway não nasce de uma requisição HTTP
 * — nasce de um evento do socket do WhatsApp. Um interceptor HTTP sozinho não
 * cobriria esse caminho.
 */
@Injectable()
export class CorrelationService {
  private readonly storage = new AsyncLocalStorage<CorrelationStore>();

  /** Executa `fn` dentro de um novo escopo de correlação. */
  runWith<T>(correlationId: string | undefined, fn: () => T): T {
    return this.storage.run({ correlationId: correlationId ?? randomUUID() }, fn);
  }

  /** Id do escopo atual, ou `undefined` fora de qualquer escopo. */
  get current(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }
}
