import { access, mkdir, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { Injectable } from '@nestjs/common';

import { AuthStateRepository } from '@/channels/whatsapp/domain/auth-state.repository.port';
import { TypedConfigService } from '@/config/typed-config.service';

/**
 * Credenciais de sessão em disco (volume Docker).
 *
 * É a implementação mínima que cumpre o requisito real da Fase 1: sobreviver a
 * um restart sem pedir QR de novo. Não escala horizontalmente — duas réplicas
 * com o mesmo volume corromperiam o estado do Signal —, e é exatamente por isso
 * que existe a porta `AuthStateRepository`: a Fase 2 troca isto por Postgres.
 */
@Injectable()
export class FileAuthStateRepository extends AuthStateRepository {
  constructor(private readonly config: TypedConfigService) {
    super();
  }

  async resolveStoragePath(sessionId: string): Promise<string> {
    const path = this.pathFor(sessionId);
    await mkdir(path, { recursive: true });

    return path;
  }

  async clear(sessionId: string): Promise<void> {
    await rm(this.pathFor(sessionId), { recursive: true, force: true });
  }

  async exists(sessionId: string): Promise<boolean> {
    try {
      await access(join(this.pathFor(sessionId), 'creds.json'));
      return true;
    } catch {
      return false;
    }
  }

  private pathFor(sessionId: string): string {
    const root = resolve(this.config.get('WA_AUTH_DIR'));
    const path = resolve(join(root, sanitizeSessionId(sessionId)));

    // Defesa contra path traversal: `sessionId` chega pela URL.
    if (path !== root && !path.startsWith(root + sep)) {
      throw new Error(`sessionId inválido: ${sessionId}`);
    }

    return path;
  }
}

/** Só letras, números, hífen e underscore — o resto vira `-`. */
export function sanitizeSessionId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);

  if (cleaned.length === 0) {
    throw new Error('sessionId não pode ser vazio');
  }

  return cleaned;
}
