'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – CHAT API (chat-api.js)
// + Keine "Lokal Nachricht"-Modale, korrekte Online-Erkennung
// ══════════════════════════════════════════════════════════════════════════════

let pollingTimer = null;
let pendingCallModal = null; // Für eingehende Chat-Anfragen

// ─────────────────────────────────────────────────────────────────────────────
// EIGENSTÄNDIGE BENACHRICHTIGUNGEN
function playChatNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.type = 'sine';
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {}
}

function triggerChatHaptic() {
  if (navigator.vibrate) navigator.vibrate(200);
}

function showChatInAppNotif(from, text) {
  const el = document.getElementById('in-notif');
  if (!el) return;
  document.getElementById('in-from').textContent = '💬 ' + from;
  document.getElementById('in-msg').textContent = text.length > 60 ? text.slice(0, 60) + '…' : text;
  el.classList.add('show');
  clearTimeout(window._chatNotifTimer);
  window._chatNotifTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

// 🆕 Modal für eingehende Chat-Anfrage (Annehmen/Ablehnen)
function showIncomingChatRequest(senderCode, senderName) {
  // Altes Modal entfernen
  if (pendingCallModal) pendingCallModal.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:320px; text-align:center;">
      <div style="font-size:3rem; margin-bottom:0.5rem;">🧑</div>
      <h3>${esc(senderName)}</h3>
      <p style="color:var(--text-dim);">${formatCode(senderCode)}</p>
      <p>möchte mit dir chatten</p>
      <div style="display:flex; gap:0.8rem; margin-top:1.5rem;">
        <button class="btn-secondary" id="decline-chat-request" style="flex:1;">✕ Ablehnen</button>
        <button class="btn-primary" id="accept-chat-request" style="flex:1;">✓ Annehmen</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  pendingCallModal = modal;

  document.getElementById('accept-chat-request').addEventListener('click', () => {
    modal.remove();
    pendingCallModal = null;
    // Chat mit dem Anfrager öffnen
    partnerCode = senderCode;
    partnerName = senderName;
    chatId = buildCID(myCode, senderCode);
    loadPendingMessages();
    migratePendingMessages(chatId);
    openApiChat();
  });

  document.getElementById('decline-chat-request').addEventListener('click', () => {
    modal.remove();
    pendingCallModal = null;
    toast('📵 Chat-Anfrage abgelehnt');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NACHRICHTEN SENDEN/EMPFANGEN
function sendMsg() {
  const inp = document.getElementById('minp');
  const text = inp.value.trim();
  if (!text) return;

  if (!partnerCode || !chatId) {
    toast('⚠️ Kein aktiver Chat');
    return;
  }

  const m = { t: 'text', text, ts: Date.now(), own: true };
  appendMsg(m);
  persistMsg(m);

  // 🆕 "Lokal Nachricht"-Modal unterdrücken
  const originalShowInfoModal = window.showInfoModal;
  window.showInfoModal = function() {};

  addPendingMessage(text);

  window.showInfoModal = originalShowInfoModal;

  // Online-Status prüfen
  if (navigator.onLine && myToken) {
    sendToServer(partnerCode, text);
  } else {
    toast('📴 Offline – Nachricht gespeichert');
  }

  inp.value = '';
  inp.style.height = 'auto';
}

async function sendToServer(recipient, message) {
  try {
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, senderCode: myCode, senderName: myName, message })
    });
    if (res.ok) removePendingMessageByText(message);
  } catch (e) {}
}

function removePendingMessageByText(text) {
  if (typeof pendingMessages !== 'undefined') {
    const index = pendingMessages.findIndex(m => m.text === text);
    if (index !== -1) {
      pendingMessages.splice(index, 1);
      savePendingMessages();
      updatePendingBadge();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBALES POLLING
function startGlobalPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(async () => {
    if (!myToken) return;
    try {
      const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
      if (!res.ok) return;
      const msgs = await res.json();

      msgs.filter(m => !m.read).forEach(m => {
        // Chat‑Request
        if (m.message === '__CHAT_REQUEST__' || m.type === 'chat_request') {
          const senderName = m.senderName || formatCode(m.senderCode);
          // 🆕 Modal statt nur In‑App
          showIncomingChatRequest(m.senderCode, senderName);
          playChatNotificationSound();
          triggerChatHaptic();
          markOfflineMsgRead(m.id);
          return;
        }

        // Normale Nachricht
        if (partnerCode && m.senderCode === partnerCode) {
          const ts = new Date(m.timestamp).getTime();
          if (!isMessageAlreadyStored(ts, false)) {
            appendMsg({ t: 'text', text: m.message, ts, own: false });
            persistMsg({ t: 'text', text: m.message, ts, own: false });
            notify(m.message);
            playChatNotificationSound();
            triggerChatHaptic();
          }
          markOfflineMsgRead(m.id);
        }
      });
    } catch (e) {}
  }, 15000);
}

function isMessageAlreadyStored(ts, own) {
  if (!chatId) return false;
  const chatKey = 'smmsg_' + chatId;
  const msgs = JSON.parse(localStorage.getItem(chatKey) || '[]');
  return msgs.some(m => m.ts === ts && m.own === own);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT ÖFFNEN
function openApiChat() {
  prepChat();
  showScreen('s-chat');
  document.getElementById('sbtn').disabled = false;
  document.getElementById('rcbar').classList.remove('show');
  refreshStatusText();
  document.getElementById('pav').className = 'pav';
  applyPartnerName();
  const h = document.getElementById('ehint');
  if (h) {
    h.innerHTML = `<div class="empty-icon">💬</div>
      <div class="empty-txt" style="font-weight:600;color:var(--text)">Chat bereit</div>
      <div class="empty-hint">Nachrichten werden über Server zugestellt</div>`;
  }
  updateIdx('');
  setSpill('online', '● ONLINE');
  updateConnectionStatus();
  startGlobalPolling();
}

function stopChatPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

window.openChat = openApiChat;
