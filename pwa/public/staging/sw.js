/**
 * Service worker do staging: só avisos.
 *
 * Separado do /sw.js de propósito. O do `/` guarda páginas em cache para o chat
 * de campo abrir sem rede; este não guarda nada: o staging muda a cada
 * atualização, e uma tela velha servida do cache faria o teste medir a versão
 * errada. O escopo /staging/ garante que um não mexe nas páginas do outro.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

/**
 * Mostra o aviso.
 *
 * Todo push precisa virar notificação visível: o navegador cobra isso, e um push
 * silencioso faz o Chrome passar a mostrar um aviso genérico no lugar, ou
 * cancelar a inscrição. Por isso há texto de reserva mesmo quando o conteúdo não
 * pôde ser lido.
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

  // "Recebida" sai antes de tudo, e "exibida" só depois de a notificação ter
  // sido mostrada de fato. Antes os dois saíam juntos, e um celular que
  // bloqueava a notificação parecia igual a um que nem recebia o aviso.
  evento.waitUntil(
    Promise.all([
      enviarRecibo(dados, 'recebida'),
      self.registration.showNotification(titulo, opcoes).then(() => enviarRecibo(dados, 'exibida')),
    ]),
  );
});

/** Abre o aviso: reaproveita uma janela do app aberta, ou abre uma nova. */
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

/**
 * O navegador trocou a inscrição sozinho (o Firefox faz isso; o Chrome, raramente).
 *
 * Sem reinscrever e avisar o servidor, os avisos param de chegar em silêncio:
 * o servidor continua enviando para o endpoint antigo, que responde 410 e é
 * apagado.
 */
self.addEventListener('pushsubscriptionchange', (evento) => {
  evento.waitUntil(
    (async () => {
      const { chavePublica } = await fetch('/api/push/chave-publica').then((r) => r.json());
      const nova = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaBytes(chavePublica),
      });
      await fetch('/api/push/inscricoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nova.toJSON()),
      });
    })().catch(() => {}),
  );
});

/**
 * Avisa o servidor que o aviso apareceu ou foi aberto.
 *
 * Nunca atrasa nem impede a notificação: falhou, falhou; é estatística, e o
 * aviso já cumpriu o papel dele.
 */
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
    // Sem rede no momento em que o aviso chegou. Nada a fazer.
  }
}

function base64UrlParaBytes(texto) {
  const preenchido = texto + '='.repeat((4 - (texto.length % 4)) % 4);
  const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bruto, (caractere) => caractere.charCodeAt(0));
}
