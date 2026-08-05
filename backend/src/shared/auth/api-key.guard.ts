import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TypedConfigService } from '@/config/typed-config.service';

import { IS_PUBLIC_KEY } from './public.decorator';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Guard global de API key.
 *
 * Substitui o `X-Api-Key` que o WAHA exigia, mantendo o mesmo header — o n8n
 * já enviava esse cabeçalho, então a mudança para ele é só o valor.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: TypedConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[API_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !safeCompare(provided, this.config.get('GATEWAY_API_KEY'))) {
      throw new UnauthorizedException('API key ausente ou inválida.');
    }

    return true;
  }
}

/** Comparação em tempo constante — evita distinguir chaves por tempo de resposta. */
function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
