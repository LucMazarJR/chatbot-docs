import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * ConfigService tipado: `config.get('PORT')` devolve `number`, não `unknown`.
 * Evita o `get<string>('...')` espalhado pelo código, que é só um cast disfarçado.
 *
 * Vive em arquivo próprio, separado de `config.module.ts`, porque o módulo
 * valida o ambiente no momento em que é carregado — se os dois estivessem
 * juntos, qualquer arquivo que importasse este serviço exigiria um `.env`
 * completo só para ser carregado (inclusive em teste unitário).
 */
@Injectable()
export class TypedConfigService {
  constructor(private readonly config: ConfigService) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key as string) as Env[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}
