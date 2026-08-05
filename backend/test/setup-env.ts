/**
 * Ambiente mínimo para o teste e2e.
 *
 * Roda como `setupFiles` do Jest, ou seja, antes de qualquer import do
 * `AppModule` — o `AppConfigModule` valida o ambiente no momento em que é
 * carregado e o processo morreria antes do primeiro teste.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.GATEWAY_API_KEY = 'chave-de-teste-com-mais-de-16';
process.env.N8N_WEBHOOK_URL = 'http://n8n:5678/webhook/whatsapp';
process.env.N8N_WEBHOOK_TOKEN = 'token-de-teste-com-mais-de-16';
process.env.N8N_WEBHOOK_SECRET = 'segredo-de-teste-com-mais-16';
process.env.WA_AUTO_START = 'false';
process.env.WA_SESSION_ID = 'default';
process.env.WA_AUTH_DIR = './.sessions-test';
process.env.WA_SEND_MIN_DELAY_MS = '0';
process.env.WA_SEND_MAX_DELAY_MS = '0';
process.env.WA_MAX_TYPING_MS = '0';
