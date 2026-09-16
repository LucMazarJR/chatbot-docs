'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker do staging, com escopo só em /staging/.
 *
 * Fica na moldura do staging, e não só na tela de avisos: o aviso que chega
 * precisa do service worker ativo mesmo que a pessoa nunca tenha aberto aquela
 * tela nesta visita, e instalar o app pela tela de início exige que ele exista.
 */
export function RegistrarSWStaging() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/staging/sw.js', { scope: '/staging/' }).catch(() => {});
    }
  }, []);

  return null;
}
