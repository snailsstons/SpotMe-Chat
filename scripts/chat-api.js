'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – CHAT API (chat-api.js)
// + Eigenständige Benachrichtigungen (Klingelton, Vibration, In‑App)
// ══════════════════════════════════════════════════════════════════════════════

let pollingTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// EIGENSTÄNDIGE BENACHRICHTIGUNGEN (Klingelton, Vibration, In‑App)
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
  addPendingMessage(text);

  if (myToken) {
    sendToServer(partnerCode, text);
  } else {
    toast('⚠️ Profil nicht veröffentlicht – Nachricht nur lokal gespeichert.');
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
// GLOBALES POLLING (läuft immer, sobald Token vorhanden)
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
          showChatInAppNotif(senderName, 'möchte mit dir chatten');
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
