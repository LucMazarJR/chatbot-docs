import { z } from 'zod';

/**
 * Schema único de configuração do gateway.
 *
 * A aplicação não sobe com configuração inválida (fail-fast no boot): é
 * preferível quebrar no `docker compose up` do que descobrir em produção que
 * o webhook do n8n estava apontando para lugar nenhum.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** Chave que o n8n (e qualquer outro cliente) apresenta em `X-Api-Key`. */
  GATEWAY_API_KEY: z.string().min(16, 'GATEWAY_API_KEY deve ter no mínimo 16 caracteres'),

  /** Sessão padrão criada automaticamente no boot. */
  WA_SESSION_ID: z.string().min(1).default('default'),
  /** Diretório do auth state do Baileys (volume Docker). */
  WA_AUTH_DIR: z.string().min(1).default('/app/.sessions'),
  /** Conecta a sessão padrão assim que a aplicação sobe. */
  WA_AUTO_START: z.coerce.boolean().default(true),
  /** Marca as mensagens recebidas como lidas antes de responder. */
  WA_MARK_AS_READ: z.coerce.boolean().default(true),

  // --- Anti-ban: nunca responder instantaneamente nem em rajada ---
  WA_SEND_MIN_DELAY_MS: z.coerce.number().int().nonnegative().default(1200),
  WA_SEND_MAX_DELAY_MS: z.coerce.number().int().nonnegative().default(3000),
  WA_MAX_MSG_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /** Teto do "digitando..." simulado antes de cada envio. */
  WA_MAX_TYPING_MS: z.coerce.number().int().nonnegative().default(4000),

  // --- Entrega de eventos ao n8n ---
  N8N_WEBHOOK_URL: z.string().url(),
  /** Validado pela credencial Header Auth do nó Webhook do n8n. */
  N8N_WEBHOOK_TOKEN: z.string().min(16, 'N8N_WEBHOOK_TOKEN deve ter no mínimo 16 caracteres'),
  /** Segredo do HMAC enviado em `X-Signature-256` (validação entra na Fase 2). */
  N8N_WEBHOOK_SECRET: z.string().min(16, 'N8N_WEBHOOK_SECRET deve ter no mínimo 16 caracteres'),
  N8N_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  N8N_WEBHOOK_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),

  // --- Redis (dedupe de mensagens) ---
  REDIS_HOST: z.string().min(1).default('redis'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  /** db 1 para não colidir com a memória de chat do n8n (db 0). */
  REDIS_DB: z.coerce.number().int().nonnegative().default(1),
  /** Janela de deduplicação de mensagens recebidas. */
  DEDUPE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida `process.env` e devolve a configuração tipada.
 * Usado como `validate` do ConfigModule.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const detalhes = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Configuração inválida. Corrija o .env:\n${detalhes}`);
  }

  return result.data;
}
