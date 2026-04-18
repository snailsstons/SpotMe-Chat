'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – CHAT API (chat-api.js)
// Senden/Empfangen über /api/offline-message, Polling alle 15 Sekunden
// ══════════════════════════════════════════════════════════════════════════════

let lastPoll = Date.now();
let pollingTimer = null;
let pendingSendQueue = [];

function sendMsg() {
  const inp = document.getElementById('minp');
  const text = inp.value.trim();
  if (!text) return;

  if (!partnerCode || !chatId) {
    toast('⚠️ Kein aktiver Chat');
    return;
  }

  const m = { t: 'text', text, ts: Date.now(), own: true };

  // 1. Sofort im Chat anzeigen
  appendMsg(m);
  persistMsg(m);

  // 2. In Pending‑Queue für Offline‑Fallback
  addPendingMessage(text);

  // 3. An Server senden (wenn Token vorhanden)
  if (myToken) {
    sendToServer(partnerCode, text);
  } else {
    console.warn('Kein Token – Nachricht bleibt in Pending‑Queue');
  }

  inp.value = '';
  inp.style.height = 'auto';
}

async function sendToServer(recipient, message) {
  try {
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        senderCode: myCode,
        senderName: myName,
        message
      })
    });
    if (res.ok) {
      // Erfolgreich gesendet – aus Pending‑Queue entfernen
      removePendingMessageByText(message);
    }
  } catch (e) {
    console.warn('Server nicht erreichbar – Nachricht bleibt in Queue');
  }
}

function removePendingMessageByText(text) {
  // Einfache Implementierung: wir filtern die pendingMessages (aus storage.js)
  if (typeof pendingMessages !== 'undefined') {
    const index = pendingMessages.findIndex(m => m.text === text);
    if (index !== -1) {
      pendingMessages.splice(index, 1);
      savePendingMessages();
      updatePendingBadge();
    }
  }
}

// Polling für neue Nachrichten starten
function startChatPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(async () => {
    if (!myToken || !partnerCode || !chatId) return;
    try {
      const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
      if (!res.ok) return;
      const msgs = await res.json();
      msgs.filter(m => m.senderCode === partnerCode && !m.read)
          .forEach(m => {
            // Prüfen, ob Nachricht bereits lokal existiert (via timestamp)
            const ts = new Date(m.timestamp).getTime();
            if (!isMessageAlreadyStored(ts, false)) {
              appendMsg({ t: 'text', text: m.message, ts, own: false });
              persistMsg({ t: 'text', text: m.message, ts, own: false });
              notify(m.message);
              playNotificationSound();
              triggerHaptic();
            }
            // Als gelesen markieren
            markOfflineMsgRead(m.id);
          });
    } catch (e) {}
  }, 15000);
}

function isMessageAlreadyStored(ts, own) {
  const chatKey = 'smmsg_' + chatId;
  const msgs = JSON.parse(localStorage.getItem(chatKey) || '[]');
  return msgs.some(m => m.ts === ts && m.own === own);
}

// Wird aufgerufen, wenn der Chat geöffnet wird (ersetzt openChat)
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
  startChatPolling();
}

function stopChatPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// Überschreibe das alte openChat (falls noch referenziert)
window.openChat = openApiChat;
