/**
 * Service worker do protótipo.
 *
 * Faz o mínimo que torna a página instalável e resistente a uma oscilação de
 * rede na hora de abrir: guarda a casca do aplicativo e serve dela quando a
 * rede falha ou demora.
 *
 * O que ele deliberadamente NÃO faz é guardar resposta de API. Toda pergunta
 * precisa passar pelo n8n: servir uma resposta de saúde em cache, gravada
 * noutra conversa, seria pior do que não responder.
 */

// v2 descarta o cache da v1, que guardava toda resposta, inclusive páginas do
// /staging com conta e conversa.
const CACHE = 'prototipo-pwa-v2';
const CASCA = ['/', '/manifest.webmanifest', '/icons/icone-192.png', '/icons/icone-512.png'];

/*
 * Quanto a navegação espera pela rede antes de abrir a cópia guardada.
 *
 * LÓGICA DO LUCIANO: sem prazo, uma rede que não responde (sinal fraco, Wi-Fi
 * com portal, função da Vercel acordando) deixava a tela em branco até o
 * navegador desistir, com a cópia boa da página parada no cache. Quem já tinha
 * aberto o chat no dia era justamente quem ficava sem conseguir abrir. Quatro
 * segundos cobrem uma resposta lenta normal; passou disso, a cópia abre e a
 * resposta da rede ainda atualiza o cache para a próxima vez.
 */
const PRAZO_DA_REDE = 4000;

// Os arquivos de /_next/static mudam de nome a cada versão, então o cache só
// cresce. Guardar os mais recentes basta para abrir sem rede.
const MAXIMO_DE_ESTATICOS = 150;

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

  // O /staging tem conta, histórico e avisos de cada pessoa. Nada dele fica
  // guardado no aparelho, nem quando este service worker é quem está no
  // controle (antes de o /staging/sw.js ser registrado).
  if (url.pathname.startsWith('/staging')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(doCacheOuDaRede(requisicao));
    return;
  }

  if (requisicao.mode === 'navigate') {
    evento.respondWith(navegar(evento));
  }
});

/** O nome do arquivo muda quando o conteúdo muda: a cópia guardada nunca envelhece. */
async function doCacheOuDaRede(requisicao) {
  const guardada = await caches.match(requisicao);
  if (guardada) return guardada;
  const resposta = await fetch(requisicao);
  if (resposta.ok) {
    const copia = resposta.clone();
    caches
      .open(CACHE)
      .then((cache) => cache.put(requisicao, copia).then(() => podarEstaticos(cache)))
      .catch(() => {});
  }
  return resposta;
}

async function podarEstaticos(cache) {
  const chaves = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/_next/static/'));
  // keys() vem na ordem de inserção: os primeiros são os mais antigos.
  const sobra = chaves.length - MAXIMO_DE_ESTATICOS;
  for (let i = 0; i < sobra; i += 1) await cache.delete(chaves[i]);
}

async function navegar(evento) {
  const requisicao = evento.request;

  // Só resposta boa vira cópia: guardar um 500 da Vercel faria o erro abrir
  // no lugar da página quando a rede faltasse.
  const daRede = fetch(requisicao).then((resposta) => {
    if (resposta.ok) {
      const copia = resposta.clone();
      caches.open(CACHE).then((cache) => cache.put(requisicao, copia)).catch(() => {});
    }
    return resposta;
  });
  // A resposta da rede termina de chegar e atualiza o cache mesmo depois de a
  // cópia já ter sido mostrada.
  evento.waitUntil(daRede.catch(() => {}));

  const guardada = await caches.match(requisicao);
  if (!guardada) {
    // Nunca aberta aqui: espera a rede, e sem ela cai no chat, que é a raiz.
    return daRede.catch(async () => (await caches.match('/')) || Response.error());
  }

  const prazo = new Promise((resolver) => setTimeout(() => resolver(guardada), PRAZO_DA_REDE));
  const rede = daRede.then(
    // Servidor fora do ar responde 5xx rápido; a cópia é melhor que a página de erro.
    (resposta) => (resposta.status >= 500 ? guardada : resposta),
    () => guardada,
  );
  return Promise.race([rede, prazo]);
}

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
