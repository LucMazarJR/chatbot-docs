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

/*
 * Avisos que caíram aqui por engano.
 *
 * LÓGICA DO LUCIANO: o chat de campo não usa push, mas este service worker tem
 * escopo no site inteiro, e aparelhos ativaram os avisos do /staging com a
 * inscrição presa nele (ver docs/armadilhas.md, "serviceWorker.ready"). Sem
 * estes dois ouvintes, o push chegava, nada era mostrado, e o Chrome exibia o
 * genérico "Este site foi atualizado em segundo plano".
 *
 * Mesma lógica do /staging/sw.js, de propósito: o aviso aparece igual, e os
 * recibos medem igual, venha de qual service worker vier. Para quem só usa o
 * chat de campo nada muda: sem inscrição, nenhum push chega aqui.
 */
self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = {};
  }

  const titulo = dados.titulo || 'Novo aviso';
  const opcoes = {
    body: dados.corpo || 'Toque para ver.',
    icon: '/icons/icone-192.png',
    badge: '/icons/icone-192.png',
    tag: dados.tag,
    lang: 'pt-BR',
    data: { id: dados.id, recibo: dados.recibo, url: dados.url || '/staging/avisos' },
  };

  evento.waitUntil(
    Promise.all([
      enviarRecibo(dados, 'recebida'),
      self.registration.showNotification(titulo, opcoes).then(() => enviarRecibo(dados, 'exibida')),
    ]),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const dados = evento.notification.data || {};
  const destino = new URL(dados.url || '/staging/avisos', self.location.origin).href;

  evento.waitUntil(
    Promise.all([
      enviarRecibo(dados, 'aberta'),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
        const doApp = janelas.find((janela) => janela.url.startsWith(`${self.location.origin}/staging`));
        if (doApp) return doApp.navigate(destino).then((janela) => janela && janela.focus());
        return self.clients.openWindow(destino);
      }),
    ]),
  );
});

async function enviarRecibo(dados, evento) {
  if (!dados || !dados.id || !dados.recibo) return;
  let endpoint = null;
  try {
    const inscricao = await self.registration.pushManager.getSubscription();
    endpoint = inscricao ? inscricao.endpoint : null;
  } catch {
    endpoint = null;
  }
  try {
    await fetch('/api/notificacoes/recibos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: dados.id, recibo: dados.recibo, evento, endpoint }),
    });
  } catch {
    // Sem rede no momento em que o aviso chegou. É estatística; o aviso já apareceu.
  }
}
