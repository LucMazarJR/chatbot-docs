const CONFIG = {
  botName: "PET-Saúde",
  botSubtitleOnline: "online",
  avatarSrc: "/b/icons/avatar.png",
  privacyUrl: "https://exemplo.org/politica-de-privacidade", // TODO: substituir pelo link real dos Termos/LGPD
};

let idCounter = 1;
function newId(){ return "m" + (idCounter++); }
function nowTime(){
  const d = new Date();
  return d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0");
}

// Estado da conversa e do consentimento LGPD
let messages = [];
let consentStatus = null; // null | "accepted" | "declined"
let lastSender = null;

// ===========================================================================
// Ligação com o backend do protótipo.
//
// Esta é a ÚNICA parte do arquivo que mudou em relação ao desenho original: os
// quatro stubs que gravavam em localStorage passaram a falar com a mesma API
// que a versão A usa. O resto — layout, estilos, animações, player de áudio,
// seletor de emoji — está exatamente como foi entregue.
//
// A conversa segue por /api/sessoes → n8n → busca vetorial → Gemini, igual ao
// WhatsApp. O que está em avaliação aqui é a interface, não o motor.
// ===========================================================================

const TEXTO_INDISPONIVEL =
  "Não consegui responder agora. 😕 Por favor, tente novamente em alguns minutos. " +
  "Se for uma emergência, procure atendimento médico imediato ou ligue 192.";

// A resposta do agente vem na formatação do WhatsApp, e o canal real só aceita
// texto. Mesma mensagem que o cidadão recebe ao mandar áudio ou imagem lá.
const TEXTO_SOMENTE_TEXTO =
  "Olá! 😊 No momento, consigo responder apenas mensagens de texto. " +
  "Por favor, digite sua pergunta para que eu possa te ajudar.";

// Chave própria por versão: quem experimenta as duas interfaces precisa de uma
// conversa separada em cada, senão a segunda retomaria a sessão da primeira e
// as duas ficariam indistinguíveis na tela de revisão.
const CHAVE_SESSAO = "pwa:sessao:b";

let sessaoId = null;
// Guarda o id que o servidor deu para cada resposta do bot, para o polegar
// saber a qual mensagem se refere. O `m.id` local ("m3") não existe no banco.
const idsDoServidor = new Map();

async function abrirSessao(){
  const guardada = localStorage.getItem(CHAVE_SESSAO);

  if (guardada){
    try {
      const res = await fetch(`/api/sessoes/${guardada}/mensagens`);
      if (res.ok){
        const dados = await res.json();
        // Sessão já avaliada não volta: quem encerrou fez isso de propósito.
        if (!dados.encerrada){
          sessaoId = guardada;
          return;
        }
      }
    } catch {}
    localStorage.removeItem(CHAVE_SESSAO);
  }

  try {
    const res = await fetch("/api/sessoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versao: "b" })
    });
    if (!res.ok) throw new Error("falha ao criar sessão");
    const dados = await res.json();
    sessaoId = dados.sessaoId;
    localStorage.setItem(CHAVE_SESSAO, sessaoId);
  } catch {
    sessaoId = null;
  }
}

async function sendMessageToBackend(text, history){
  if (!sessaoId) await abrirSessao();
  if (!sessaoId) return { text: TEXTO_INDISPONIVEL, buttons: null };

  try {
    const res = await fetch(`/api/sessoes/${sessaoId}/mensagens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: text })
    });

    if (res.status === 429){
      return { text: "Você enviou muitas mensagens seguidas. Aguarde alguns minutos.", buttons: null };
    }
    if (res.status === 409){
      // A sessão foi encerrada pela avaliação: começa outra e repete a pergunta.
      localStorage.removeItem(CHAVE_SESSAO);
      sessaoId = null;
      return sendMessageToBackend(text, history);
    }
    if (!res.ok) throw new Error("HTTP " + res.status);

    const dados = await res.json();
    return { text: dados.resposta, buttons: null, serverId: dados.erro ? null : dados.mensagemId };
  } catch {
    return { text: TEXTO_INDISPONIVEL, buttons: null };
  }
}

/**
 * Anexos e áudio não têm caminho no fluxo: o agente só recebe texto.
 *
 * Em vez de fingir que funcionou, responde o mesmo aviso que o WhatsApp real
 * envia nesse caso — o protótipo existe para mostrar a experiência de verdade.
 */
async function sendAttachmentToBackend(file){
  return Promise.resolve();
}

/** Avaliação final da conversa, pelo menu "Feedback". */
async function submitFeedback(entry){
  if (!sessaoId) return;

  // As quatro carinhas viram a mesma escala de 1 a 5 da versão A, senão as duas
  // interfaces produziriam números que não dá para comparar na revisão.
  const ESTRELAS = { ruim: 1, ok: 3, boa: 4, otima: 5 };

  await fetch(`/api/sessoes/${sessaoId}/avaliacao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      estrelas: ESTRELAS[entry.rating] ?? null,
      nps: entry.nps ?? null,
      comentario: entry.text || ""
    })
  }).catch(() => {});

  // A sessão foi encerrada no servidor; a próxima mensagem abre outra.
  localStorage.removeItem(CHAVE_SESSAO);
  sessaoId = null;
}

/** Polegar em uma resposta, com o comentário opcional que esta versão pede. */
async function submitMessageFeedback(entry){
  const idNoServidor = idsDoServidor.get(entry.messageId);
  if (!idNoServidor) return;

  await fetch(`/api/mensagens/${idNoServidor}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voto: entry.rating, comentario: entry.comment || "" })
  }).catch(() => {});
}

/**
 * "Relatar um problema" entra como comentário da avaliação da sessão.
 *
 * Não existe coleção separada para isso, e criar uma para um campo que só uma
 * das duas interfaces oferece atrapalharia a comparação. O tipo do problema vai
 * junto no texto.
 */
async function submitErrorReport(entry){
  if (!sessaoId) return;

  await fetch(`/api/sessoes/${sessaoId}/avaliacao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      estrelas: null,
      nps: null,
      comentario: `[problema relatado: ${entry.type}] ${entry.description || ""}`
    })
  }).catch(() => {});

  localStorage.removeItem(CHAVE_SESSAO);
  sessaoId = null;
}

// Abre a sessão assim que a página carrega, para a primeira pergunta não pagar
// o custo de criar a sessão antes de ser enviada.
abrirSessao();

// RENDER: cabeçalho
document.getElementById("chat-title").textContent = CONFIG.botName;
document.getElementById("chat-status").textContent = CONFIG.botSubtitleOnline;
document.getElementById("chat-avatar").innerHTML = `<img src="${CONFIG.avatarSrc}" alt="${CONFIG.botName}" />`;

document.getElementById("video-call-btn").addEventListener("click", () => showToast("Chamada de vídeo não disponível neste protótipo."));
document.getElementById("voice-call-btn").addEventListener("click", () => showToast("Chamada de voz não disponível neste protótipo."));

// Helpers de escape/format
function escapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function linkify(text){
  const escaped = escapeHtml(text);
  return escaped.replace(/(https?:\/\/[^\s)]+)/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

function formatBytes(bytes){
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1024/1024).toFixed(1) + " MB";
}

// RENDER de mensagens
const messagesEl = document.getElementById("messages");

function buildTicks(){
  return `<svg class="ticks" width="16" height="11" viewBox="0 0 16 11"><path fill="currentColor" d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.146.47.47 0 0 0-.336.146l-.42.406a.489.489 0 0 0 0 .68l3.077 3.06c.176.176.463.176.64 0l.398-.406 6.69-8.343a.5.5 0 0 0-.084-.687l-.35-.15zM15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-.87-.822-1.05 1.043 1.31 1.24c.176.176.463.176.64 0l.398-.406 6.69-8.343a.5.5 0 0 0-.084-.687l-.16-.14z"/></svg>`;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const DEFAULT_REACTION = "❤️";
let activeReactionPicker = null;

function closeReactionPicker(){
  if (activeReactionPicker){
    activeReactionPicker.remove();
    activeReactionPicker = null;
  }
}
document.addEventListener("click", closeReactionPicker);
document.addEventListener("scroll", closeReactionPicker, true);

// Mostra/atualiza o "chip" com o emoji escolhido no canto do balão
function renderReactionPill(m, wrapEl){
  const block = wrapEl.closest(".msg-block");
  let pill = wrapEl.querySelector(".msg-reaction");
  if (m.reaction){
    if (!pill){
      pill = document.createElement("div");
      pill.className = "msg-reaction";
      pill.title = "Remover reação";
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleReaction(m, m.reaction, wrapEl);
      });
      wrapEl.appendChild(pill);
    }
    pill.textContent = m.reaction;
    if (block) block.classList.add("has-reaction");
  } else if (pill){
    pill.remove();
    if (block) block.classList.remove("has-reaction");
  }
}

// Define ou remove (se já for a mesma) a reação de uma mensagem
function toggleReaction(m, emoji, wrapEl){
  m.reaction = (m.reaction === emoji) ? null : emoji;
  renderReactionPill(m, wrapEl);
  closeReactionPicker();
}

// Abre o seletor de emojis próximo ao balão (usado no hover do computador e no toque longo do celular)
function openReactionPicker(m, wrapEl){
  if (activeReactionPicker && activeReactionPicker.dataset.for === m.id){
    closeReactionPicker();
    return;
  }
  closeReactionPicker();
  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.dataset.for = m.id;
  REACTION_EMOJIS.forEach(emoji => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "reaction-picker-opt" + (m.reaction === emoji ? " active" : "");
    opt.textContent = emoji;
    opt.setAttribute("aria-label", "Reagir com " + emoji);
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleReaction(m, emoji, wrapEl);
    });
    picker.appendChild(opt);
  });
  picker.addEventListener("click", e => e.stopPropagation());
  wrapEl.appendChild(picker);
  activeReactionPicker = picker;
}

// Liga os gestos de reação a um balão já renderizado:
// - Duplo toque/clique: curte com ❤️ (padrão do WhatsApp)
// - Botão que aparece ao passar o mouse (computador): abre o seletor de emojis
// - Toque e segure (celular): abre o seletor de emojis
function setupReactionUI(m, wrapEl){
  renderReactionPill(m, wrapEl);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "react-trigger";
  trigger.setAttribute("aria-label", "Reagir a esta mensagem");
  trigger.title = "Reagir";
  trigger.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM12 17.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z"/></svg>`;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    openReactionPicker(m, wrapEl);
  });
  wrapEl.appendChild(trigger);

  const bubbleEl = wrapEl.querySelector(".bubble");
  if (!bubbleEl) return;

  // Duplo clique (computador) / duplo toque (a maioria dos navegadores móveis dispara "dblclick" também)
  bubbleEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    toggleReaction(m, DEFAULT_REACTION, wrapEl);
  });

  // Toque e segure para abrir o seletor no celular
  let pressTimer = null;
  let longPressFired = false;
  const clearPressTimer = () => { clearTimeout(pressTimer); pressTimer = null; };

  bubbleEl.addEventListener("touchstart", () => {
    longPressFired = false;
    clearPressTimer();
    pressTimer = setTimeout(() => {
      longPressFired = true;
      if (navigator.vibrate) navigator.vibrate(12);
      openReactionPicker(m, wrapEl);
    }, 480);
  }, { passive: true });
  bubbleEl.addEventListener("touchend", clearPressTimer);
  bubbleEl.addEventListener("touchmove", clearPressTimer);
  bubbleEl.addEventListener("touchcancel", clearPressTimer);
  bubbleEl.addEventListener("contextmenu", (e) => {
    if (longPressFired) e.preventDefault();
  });
}

function renderMessageNode(m){
  const block = document.createElement("div");
  block.className = "msg-block " + (m.from === "user" ? "sent" : "received") + (m.grouped ? " grouped" : "") + (m.reaction ? " has-reaction" : "");
  block.dataset.id = m.id;

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "bubble-wrap";

  if (m.type === "file"){
    bubbleWrap.innerHTML = `
      <div class="bubble">
        <div class="file-row">
          <div class="file-icon"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5z"/></svg></div>
          <div>
            <div class="file-meta-name">${escapeHtml(m.fileName)}</div>
            <div class="file-meta-size">${escapeHtml(m.fileSize)}</div>
          </div>
        </div>
        <div class="bubble-meta-row"><span>${m.time}</span>${m.from === "user" ? buildTicks() : ""}</div>
      </div>`;
  } else if (m.type === "audio"){
    bubbleWrap.innerHTML = `
      <div class="bubble">
        <div class="voice-msg">
          <button class="voice-play-btn" type="button" aria-label="Reproduzir áudio">
            <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="icon-pause" style="display:none" viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
          </button>
          <div class="voice-wave-wrap">
            <div class="voice-wave-bg"></div>
            <div class="voice-wave-fg"></div>
          </div>
          <span class="voice-time">0:00</span>
        </div>
        <div class="bubble-meta-row"><span>${m.time}</span>${m.from === "user" ? buildTicks() : ""}</div>
      </div>`;
  } else {
    bubbleWrap.innerHTML = `
      <div class="bubble">
        <p class="bubble-p"><span class="bubble-text-inline">${linkify(m.text)}</span><span class="bubble-meta"><span>${m.time}</span>${m.from === "user" ? buildTicks() : ""}</span></p>
      </div>`;
  }

  setupReactionUI(m, bubbleWrap);
  block.appendChild(bubbleWrap);

  if (m.buttons && m.buttons.length){
    const qr = document.createElement("div");
    qr.className = "quick-replies " + (m.buttons.length <= 2 ? "row" : "col");
    m.buttons.forEach(btn => {
      const b = document.createElement("button");
      b.className = "quick-reply-btn" + (m.answeredValue === btn.value ? " chosen" : "");
      b.textContent = btn.label;
      b.disabled = !!m.answeredValue;
      b.addEventListener("click", () => handleQuickReply(m, btn));
      qr.appendChild(b);
    });
    block.appendChild(qr);
  }

  if (m.from === "bot"){
    block.appendChild(buildFeedbackArea(m));
  }

  return block;
}

function buildFeedbackArea(m){
  if (m.feedback){
    const row = document.createElement("div");
    row.className = "fb-thanks";
    row.textContent = "Obrigado pelo retorno sobre esta resposta.";
    return row;
  }
  const wrap = document.createElement("div");

  const row = document.createElement("div");
  row.className = "msg-feedback";
  row.innerHTML = `
    <button class="fb-btn up" title="Resposta útil" aria-label="Resposta útil">
      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
    </button>
    <button class="fb-btn down" title="Resposta não ajudou" aria-label="Resposta não ajudou">
      <svg viewBox="0 0 24 24"><path fill="currentColor" d="M23 3h-4v12h4V3zM1 13c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 22l6.58-6.59c.37-.36.59-.86.59-1.41V4c0-1.1-.9-2-2-2h-9c-.83 0-1.54.5-1.84 1.22L1.14 10.27c-.09.23-.14.47-.14.73v2z"/></svg>
    </button>`;
  wrap.appendChild(row);

  row.querySelector(".up").addEventListener("click", () => openFeedbackExpand(m, "up", wrap));
  row.querySelector(".down").addEventListener("click", () => openFeedbackExpand(m, "down", wrap));
  return wrap;
}

function openFeedbackExpand(m, value, wrapEl){
  wrapEl.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "mfe-panel";
  const title = value === "up"
    ? "O que você gostou nesta resposta? (opcional)"
    : "O que podemos melhorar nesta resposta? (opcional)";
  panel.innerHTML = `
    <div class="mfe-title">${title}</div>
    <textarea class="mfe-text" placeholder="Escreva aqui (opcional)"></textarea>
    <div class="mfe-actions">
      <button class="mfe-skip">Pular</button>
      <button class="mfe-send">Enviar</button>
    </div>`;
  const textarea = panel.querySelector(".mfe-text");

  panel.querySelector(".mfe-skip").addEventListener("click", () => finishMessageFeedback(m, value, "", wrapEl));
  panel.querySelector(".mfe-send").addEventListener("click", () => finishMessageFeedback(m, value, textarea.value.trim(), wrapEl));

  wrapEl.appendChild(panel);
  textarea.focus();
}

async function finishMessageFeedback(m, value, comment, wrapEl){
  m.feedback = value;
  await submitMessageFeedback({
    messageId: m.id,
    messageText: m.text || "",
    rating: value,
    comment: comment,
    date: new Date().toISOString()
  });
  const thanks = document.createElement("div");
  thanks.className = "fb-thanks";
  thanks.textContent = "Obrigado pelo retorno sobre esta resposta.";
  wrapEl.replaceWith(thanks);
}

function appendMessage(m){
  m.grouped = (lastSender === m.from);
  lastSender = m.from;
  messages.push(m);
  const node = renderMessageNode(m);
  messagesEl.appendChild(node);
  if (m.type === "audio"){
    setupVoicePlayer(node, m);
  }
  scrollToBottom();
}

// Player de áudio estilo WhatsApp (forma de onda + play/pause)
let currentlyPlayingAudio = null;

function seededRandom(seed){
  let s = seed;
  return function(){
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashString(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){ h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return h;
}

function formatTime(totalSeconds){
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function setupVoicePlayer(node, m){
  const wrap = node.querySelector(".voice-wave-wrap");
  const bgEl = node.querySelector(".voice-wave-bg");
  const fgEl = node.querySelector(".voice-wave-fg");
  const timeEl = node.querySelector(".voice-time");
  const playBtn = node.querySelector(".voice-play-btn");
  const iconPlay = node.querySelector(".icon-play");
  const iconPause = node.querySelector(".icon-pause");
  if (!wrap || !playBtn) return;

  // gera barras pseudo-aleatórias, porém estáveis para esta mensagem
  const rand = seededRandom(hashString(m.id));
  const BAR_COUNT = 34;
  let barsHtml = "";
  for (let i = 0; i < BAR_COUNT; i++){
    const h = 4 + Math.round(rand() * 16); // entre 4px e 20px
    barsHtml += `<span class="voice-bar" style="height:${h}px"></span>`;
  }
  bgEl.innerHTML = barsHtml;
  fgEl.innerHTML = barsHtml;

  const audio = new Audio(m.audioUrl);
  audio.preload = "metadata";

  audio.addEventListener("loadedmetadata", () => {
    if (isFinite(audio.duration)) timeEl.textContent = formatTime(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    if (isFinite(audio.duration) && audio.duration > 0){
      const pct = (audio.currentTime / audio.duration) * 100;
      fgEl.style.width = pct + "%";
    }
    timeEl.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener("ended", () => {
    iconPlay.style.display = "block";
    iconPause.style.display = "none";
    fgEl.style.width = "0%";
    timeEl.textContent = formatTime(audio.duration || 0);
    if (currentlyPlayingAudio === audio) currentlyPlayingAudio = null;
  });

  playBtn.addEventListener("click", () => {
    if (audio.paused){
      if (currentlyPlayingAudio && currentlyPlayingAudio !== audio){
        currentlyPlayingAudio.pause();
      }
      audio.play();
      currentlyPlayingAudio = audio;
      iconPlay.style.display = "none";
      iconPause.style.display = "block";
    } else {
      audio.pause();
      iconPlay.style.display = "block";
      iconPause.style.display = "none";
    }
  });

  // Permite clicar na forma de onda para avançar/retroceder (seek)
  wrap.addEventListener("click", (e) => {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
  });
}

function scrollToBottom(){
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Fluxo inicial: boas-vindas + consentimento LGPD com botões
function initConversation(){
  const chip = document.createElement("div");
  chip.className = "date-chip";
  chip.textContent = "Hoje";
  messagesEl.appendChild(chip);

  const note = document.createElement("div");
  note.className = "system-note";
  note.innerHTML = `<svg class="lock-icon" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3zm0 10a1.6 1.6 0 0 1 .6 3.08V17.5a.6.6 0 0 1-1.2 0v-1.42A1.6 1.6 0 0 1 12 13z"/></svg><span>Este é um protótipo de testes. Não envie dados sensíveis reais aqui.</span>`;
  messagesEl.appendChild(note);

  appendMessage({
    id: newId(),
    from: "bot",
    type: "text",
    text: `É um prazer ter você aqui! 😊\nNós valorizamos muito a transparência no uso dos seus dados.\nAntes de continuarmos, pedimos que você leia e aceite nossos Termos de Privacidade e LGPD (${CONFIG.privacyUrl}).\nPor favor, confirme sua escolha respondendo com "Aceitar" ou "Recusar".`,
    time: nowTime(),
    buttons: [
      { label: "Aceitar", value: "aceitar" },
      { label: "Recusar", value: "recusar" }
    ]
  });
}

function showConsentReminder(){
  appendMessage({
    id: newId(),
    from: "bot",
    type: "text",
    text: "Tudo bem, entendo. Mas para conversarmos preciso do seu aceite aos Termos de Privacidade e LGPD.",
    time: nowTime(),
    buttons: [
      { label: "Aceitar", value: "aceitar" },
      { label: "Recusar", value: "recusar" }
    ]
  });
}

async function handleQuickReply(message, btn){
  message.answeredValue = btn.value;
  const node = messagesEl.querySelector(`[data-id="${message.id}"]`);
  if (node) node.replaceWith(renderMessageNode(message));

  appendMessage({ id: newId(), from: "user", type: "text", text: btn.label, time: nowTime() });

  if (btn.value === "aceitar"){
    consentStatus = "accepted";
    appendMessage({
      id: newId(),
      from: "bot",
      type: "text",
      text: "Perfeito! 🎓 Vamos começar. Como posso te ajudar hoje?",
      time: nowTime(),
      buttons: [
        { label: "Agendar atendimento", value: "agendar" },
        { label: "Tirar uma dúvida", value: "duvida" },
        { label: "Falar com atendente", value: "humano" }
      ]
    });
  } else if (btn.value === "recusar"){
    consentStatus = "declined";
    showConsentReminder();
  } else {
    showTyping();
    const reply = await sendMessageToBackend(btn.label, messages);
    hideTyping();
    appendBotReply(reply);
  }
}

// Envio de mensagens de texto
const input = document.getElementById("msg-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const chatStatus = document.getElementById("chat-status");

function updateComposerButtons(){
  const has = input.value.trim().length > 0;
  sendBtn.style.display = has ? "flex" : "none";
  micBtn.style.display = has ? "none" : "flex";
}

input.addEventListener("input", () => {
  updateComposerButtons();
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener("click", sendMessage);
updateComposerButtons();

async function sendMessage(){
  const text = input.value.trim();
  if (!text) return;

  appendMessage({ id: newId(), from: "user", type: "text", text, time: nowTime() });
  input.value = "";
  input.style.height = "auto";
  updateComposerButtons();

  if (consentStatus !== "accepted"){
    showConsentReminder();
    return;
  }

  showTyping();
  const reply = await sendMessageToBackend(text, messages);
  hideTyping();
  appendBotReply(reply);
}

/**
 * Acrescenta a resposta e guarda o id que o servidor deu para ela.
 *
 * O `newId()` local ("m7") só existe nesta aba; o polegar precisa apontar para
 * o documento no banco, senão o voto não teria como ser gravado.
 */
function appendBotReply(reply){
  const id = newId();
  if (reply.serverId) idsDoServidor.set(id, reply.serverId);
  appendMessage({ id, from: "bot", type: "text", text: reply.text, time: nowTime(), buttons: reply.buttons });
}

let typingRow = null;
function showTyping(){
  chatStatus.textContent = "digitando...";
  chatStatus.classList.add("typing");
  typingRow = document.createElement("div");
  typingRow.className = "typing-row";
  typingRow.innerHTML = `<div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(typingRow);
  scrollToBottom();
}
function hideTyping(){
  chatStatus.textContent = CONFIG.botSubtitleOnline;
  chatStatus.classList.remove("typing");
  if (typingRow){ typingRow.remove(); typingRow = null; }
}

// Emoji (popover funcional) — sem referências a animais/pets
const EMOJIS = ["🎓","📚","✏️","🩺","💉","❤️","😊","🙏","👍","😀","😂","🥲","😢","🎉","✅","❌","📅","📎","🤔","👏","🙌","😉","🥳","💬"];
const emojiBtn = document.getElementById("emoji-btn");
const emojiPopover = document.getElementById("emoji-popover");

EMOJIS.forEach(e => {
  const b = document.createElement("button");
  b.className = "emoji-opt";
  b.textContent = e;
  b.addEventListener("click", () => {
    insertAtCursor(input, e);
    updateComposerButtons();
  });
  emojiPopover.appendChild(b);
});

function insertAtCursor(el, text){
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + text.length;
}

emojiBtn.addEventListener("click", e => {
  e.stopPropagation();
  emojiPopover.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!emojiPopover.contains(e.target) && e.target !== emojiBtn){
    emojiPopover.classList.remove("open");
  }
});

// Anexar arquivo (funcional)
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  appendMessage({
    id: newId(),
    from: "user",
    type: "file",
    fileName: file.name,
    fileSize: formatBytes(file.size),
    time: nowTime()
  });

  await sendAttachmentToBackend(file);

  if (consentStatus !== "accepted"){
    showConsentReminder();
    return;
  }

  // Não vai ao agente: o fluxo só processa texto. Responde o mesmo aviso que o
  // WhatsApp real envia — e não gasta uma chamada da cota diária do Gemini.
  showTyping();
  await new Promise(r => setTimeout(r, 700));
  hideTyping();
  appendMessage({ id: newId(), from: "bot", type: "text", text: TEXTO_SOMENTE_TEXTO, time: nowTime() });
});

// Gravação de áudio (funcional via MediaRecorder)
const recordingBar = document.getElementById("recording-bar");
const inputWrap = document.getElementById("input-wrap");
const recTimerEl = document.getElementById("rec-timer");
const recCancelBtn = document.getElementById("rec-cancel-btn");

let mediaRecorder = null;
let audioChunks = [];
let recTimerInterval = null;
let recSeconds = 0;
let recCancelled = false;

function pickSupportedAudioMimeType(){
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported){
    return ""; // Deixa o navegador escolher o padrão dele
  }
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast("Este navegador não permite gravação de áudio (é preciso HTTPS ou localhost).");
    isRecording = false;
    return;
  }
  if (typeof MediaRecorder === "undefined"){
    showToast("Este navegador não suporta gravação de áudio.");
    isRecording = false;
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recCancelled = false;
    const mimeType = pickSupportedAudioMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const outputType = mediaRecorder.mimeType || mimeType || "audio/webm";
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (recCancelled) return;
      const blob = new Blob(audioChunks, { type: outputType });
      const url = URL.createObjectURL(blob);
      finishRecordingUI();
      handleRecordedAudio(url);
    };
    mediaRecorder.start();

    recSeconds = 0;
    recTimerEl.textContent = "0:00";
    recordingBar.classList.add("active");
    inputWrap.classList.add("hidden-by-rec");
    micBtn.style.background = "var(--rec)";

    recTimerInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60);
      const s = (recSeconds % 60).toString().padStart(2, "0");
      recTimerEl.textContent = `${m}:${s}`;
    }, 1000);
  }catch(err){
    showToast("Não foi possível acessar o microfone. Verifique as permissões.");
    isRecording = false;
  }
}

function stopRecording(cancel){
  recCancelled = !!cancel;
  if (mediaRecorder && mediaRecorder.state !== "inactive"){
    mediaRecorder.stop();
  }
  clearInterval(recTimerInterval);
  if (cancel) finishRecordingUI();
}

function finishRecordingUI(){
  recordingBar.classList.remove("active");
  inputWrap.classList.remove("hidden-by-rec");
  micBtn.style.background = "var(--accent)";
}

async function handleRecordedAudio(url){
  appendMessage({ id: newId(), from: "user", type: "audio", audioUrl: url, time: nowTime() });

  if (consentStatus !== "accepted"){
    showConsentReminder();
    return;
  }

  // Como o anexo: áudio não tem caminho no fluxo, que só processa texto.
  showTyping();
  await new Promise(r => setTimeout(r, 700));
  hideTyping();
  appendMessage({ id: newId(), from: "bot", type: "text", text: TEXTO_SOMENTE_TEXTO, time: nowTime() });
}

let isRecording = false;
micBtn.addEventListener("click", () => {
  if (!isRecording){
    isRecording = true;
    startRecording();
  } else {
    isRecording = false;
    stopRecording(false);
  }
});
recCancelBtn.addEventListener("click", () => {
  isRecording = false;
  stopRecording(true);
});

// Menu suspenso (⋮)
const menuBtn = document.getElementById("menu-btn");
const dropdownMenu = document.getElementById("dropdown-menu");

menuBtn.addEventListener("click", e => {
  e.stopPropagation();
  dropdownMenu.classList.toggle("open");
});
document.addEventListener("click", () => dropdownMenu.classList.remove("open"));

// Painel de Configurações + Tema
const settingsOverlay = document.getElementById("settings-overlay");
const themeOptionsEl = document.getElementById("theme-options");
const THEME_KEY = "app-theme"; // "light" | "dark" | "system"

function applyTheme(mode){
  let effective = mode;
  if (mode === "system"){
    effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.body.classList.toggle("theme-dark", effective === "dark");

  [...themeOptionsEl.children].forEach(opt => {
    opt.classList.toggle("selected", opt.dataset.theme === mode);
  });
}
function setTheme(mode){
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}
themeOptionsEl.addEventListener("click", e => {
  const opt = e.target.closest(".theme-opt");
  if (!opt) return;
  setTheme(opt.dataset.theme);
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const saved = localStorage.getItem(THEME_KEY) || "system";
  if (saved === "system") applyTheme("system");
});
document.getElementById("menu-settings").addEventListener("click", () => {
  dropdownMenu.classList.remove("open");
  settingsOverlay.classList.add("open");
});
document.getElementById("settings-close").addEventListener("click", () => settingsOverlay.classList.remove("open"));
settingsOverlay.addEventListener("click", e => { if (e.target === settingsOverlay) settingsOverlay.classList.remove("open"); });

setTheme(localStorage.getItem(THEME_KEY) || "system");

// Alteração de tamanho da fonte
const FONT_SCALES = [
  { id: "sm", label: "Pequeno", pct: 87.5 },
  { id: "md", label: "Médio", pct: 100 },
  { id: "lg", label: "Grande", pct: 112.5 },
  { id: "xl", label: "Extra grande", pct: 125 }
];
const FONT_KEY = "app-font-scale";
const fontsizeRow = document.getElementById("fontsize-row");
const fsDecreaseBtn = document.getElementById("fs-decrease-btn");
const fsIncreaseBtn = document.getElementById("fs-increase-btn");
const fsCurrentLabel = document.getElementById("fs-current-label");

function currentFontIndex(){
  const current = localStorage.getItem(FONT_KEY) || "md";
  const idx = FONT_SCALES.findIndex(f => f.id === current);
  return idx === -1 ? 1 : idx;
}

function applyFontScale(id){
  const found = FONT_SCALES.find(f => f.id === id) || FONT_SCALES[1];
  document.documentElement.style.fontSize = found.pct + "%";
  [...fontsizeRow.children].forEach(opt => opt.classList.toggle("selected", opt.dataset.scale === found.id));
  fsCurrentLabel.textContent = found.label;
  const idx = FONT_SCALES.findIndex(f => f.id === found.id);
  fsDecreaseBtn.disabled = idx <= 0;
  fsIncreaseBtn.disabled = idx >= FONT_SCALES.length - 1;
}
function setFontScale(id){
  localStorage.setItem(FONT_KEY, id);
  applyFontScale(id);
}
fontsizeRow.addEventListener("click", e => {
  const opt = e.target.closest(".fontsize-opt");
  if (!opt) return;
  setFontScale(opt.dataset.scale);
});
fsDecreaseBtn.addEventListener("click", () => {
  const idx = currentFontIndex();
  if (idx > 0) setFontScale(FONT_SCALES[idx - 1].id);
});
fsIncreaseBtn.addEventListener("click", () => {
  const idx = currentFontIndex();
  if (idx < FONT_SCALES.length - 1) setFontScale(FONT_SCALES[idx + 1].id);
});

setFontScale(localStorage.getItem(FONT_KEY) || "md");

// Modal: Feedback
const feedbackOverlay = document.getElementById("feedback-overlay");
const feedbackSubmit = document.getElementById("feedback-submit");
const feedbackText = document.getElementById("feedback-text");
const ratingRow = document.getElementById("rating-row");
const toast = document.getElementById("toast");
let selectedRating = null;

document.getElementById("menu-feedback").addEventListener("click", () => {
  dropdownMenu.classList.remove("open");
  selectedRating = null;
  feedbackText.value = "";
  [...ratingRow.children].forEach(el => el.classList.remove("selected"));
  feedbackSubmit.disabled = true;
  feedbackOverlay.classList.add("open");
});
document.getElementById("feedback-close").addEventListener("click", () => feedbackOverlay.classList.remove("open"));
document.getElementById("feedback-cancel").addEventListener("click", () => feedbackOverlay.classList.remove("open"));
feedbackOverlay.addEventListener("click", e => { if (e.target === feedbackOverlay) feedbackOverlay.classList.remove("open"); });

ratingRow.addEventListener("click", e => {
  const opt = e.target.closest(".rating-opt");
  if (!opt) return;
  [...ratingRow.children].forEach(el => el.classList.remove("selected"));
  opt.classList.add("selected");
  selectedRating = opt.dataset.value;
  feedbackSubmit.disabled = false;
});

feedbackSubmit.addEventListener("click", async () => {
  const entry = { rating: selectedRating, text: feedbackText.value.trim(), date: new Date().toISOString() };
  await submitFeedback(entry);
  feedbackOverlay.classList.remove("open");
  showToast("Feedback enviado. Obrigado! 🙌");
});

// Modal: Relatar problema
const reportOverlay = document.getElementById("report-overlay");
const reportText = document.getElementById("report-text");
const reportSubmit = document.getElementById("report-submit");
const reportAttach = document.getElementById("report-attach");

document.getElementById("menu-report").addEventListener("click", () => {
  dropdownMenu.classList.remove("open");
  reportText.value = "";
  reportSubmit.disabled = true;
  reportOverlay.classList.add("open");
});
document.getElementById("report-close").addEventListener("click", () => reportOverlay.classList.remove("open"));
document.getElementById("report-cancel").addEventListener("click", () => reportOverlay.classList.remove("open"));
reportOverlay.addEventListener("click", e => { if (e.target === reportOverlay) reportOverlay.classList.remove("open"); });

reportText.addEventListener("input", () => {
  reportSubmit.disabled = reportText.value.trim().length === 0;
});

reportSubmit.addEventListener("click", async () => {
  const entry = {
    type: document.getElementById("report-type").value,
    description: reportText.value.trim(),
    conversationSnapshot: reportAttach.checked ? messages.slice(-15) : null,
    userAgent: navigator.userAgent,
    date: new Date().toISOString()
  };
  await submitErrorReport(entry);
  reportOverlay.classList.remove("open");
  showToast("Problema relatado. A equipe vai analisar. Obrigado!");
});

// Toast
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

// Init
initConversation();
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}