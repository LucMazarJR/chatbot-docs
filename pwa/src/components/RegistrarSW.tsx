'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker, que é o que torna a página instalável.
 *
 * Só em contexto seguro: por IP da rede local (http) o navegador recusa, e sem
 * esta guarda o console enche de erro a cada carregamento. Na prática significa
 * que instalar no celular exige o Cloudflare Tunnel — ver docs/prototipo-pwa.md.
 */
export function RegistrarSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
