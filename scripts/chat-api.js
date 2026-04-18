'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – CHAT API (chat-api.js)
// + s-in‑Screen für eingehende Chat‑Anfragen
// ══════════════════════════════════════════════════════════════════════════════

let pollingTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// BENACHRICHTIGUNGEN (Klingelton, Vibration)
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

// 🆕 eingehende Chat‑Anfrage verarbeiten (zeigt s-in‑Screen)
function handleIncomingChatRequest(senderCode, senderName) {
  // Prüfen, ob bereits eine aktive Verbindung besteht
  if (partnerCode && document.getElementById('s-chat').classList.contains('active')) {
    toast('⚠️ Bereits in einem Chat');
    return;
  }

  // Partnerdaten für acceptCall/declineCall setzen
  window.pendingChatPartner = { code: senderCode, name: senderName };

  // s-in‑Screen aktualisieren
  document.getElementById('in-name').textContent = senderName;
  document.getElementById('in-code').textContent = 'Code: ' + formatCode(senderCode);
  document.querySelector('#s-in .caller-hint').textContent = 'möchte mit dir chatten';

  // Screen anzeigen
  showScreen('s-in');

  // Klingelton & Vibration
  playChatNotificationSound();
  triggerChatHaptic();
}

// ─────────────────────────────────────────────────────────────────────────────
// NACHRICHTEN SENDEN
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

  // "Lokal Nachricht"-Modal unterdrücken
  const originalShowInfoModal = window.showInfoModal;
  window.showInfoModal = function() {};
  addPendingMessage(text);
  window.showInfoModal = originalShowInfoModal;

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
          handleIncomingChatRequest(m.senderCode, senderName);
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
