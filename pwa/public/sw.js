/**
 * Service worker do protótipo.
 *
 * Faz o mínimo que torna a página instalável e resistente a uma oscilação de
 * rede na hora de abrir: guarda a casca do aplicativo e serve dela quando a
 * rede falha.
 *
 * O que ele deliberadamente NÃO faz é guardar resposta de API. Toda pergunta
 * precisa passar pelo n8n: servir uma resposta de saúde em cache, gravada
 * noutra conversa, seria pior do que não responder.
 */

const CACHE = 'prototipo-pwa-v1';
const CASCA = ['/', '/manifest.webmanifest', '/icons/icone-192.png', '/icons/icone-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CASCA)),
  );
  // Assume o controle já na primeira carga, sem esperar a aba ser fechada.
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só GET de navegação e de estáticos entram nesta lógica. POST para /api
  // (mensagem, feedback, avaliação) passa direto para a rede, sempre.
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  evento.respondWith(
    fetch(requisicao)
      .then((resposta) => {
        // Guarda a cópia mais recente para a próxima falha de rede.
        const copia = resposta.clone();
        caches.open(CACHE).then((cache) => cache.put(requisicao, copia)).catch(() => {});
        return resposta;
      })
      .catch(async () => {
        const guardada = await caches.match(requisicao);
        if (guardada) return guardada;
        // Navegação sem rede e sem cache da própria rota: cai na raiz.
        if (requisicao.mode === 'navigate') return caches.match('/');
        return Response.error();
      }),
  );
});
