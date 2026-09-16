/**
 * Roda uma vez, quando o servidor do Next sobe.
 *
 * Hoje só liga o relógio dos avisos. As guardas existem porque este arquivo é
 * chamado em lugares onde o relógio não deve existir:
 *
 * - runtime edge: não tem os módulos de Node que o envio usa;
 * - Vercel: a função congela entre requisições, e o intervalo nunca dispararia;
 * - build: não há servidor de pé, e o intervalo seguraria o processo aberto.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.VERCEL) return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.PWA_DESPACHANTE === 'desligado') return;

  const { iniciarRelogio } = await import('./lib/notificacoes/relogio');
  iniciarRelogio();
}
