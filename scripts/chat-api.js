'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – CHAT API (chat-api.js)
// + Schnelleres Polling (5s), Z-Index-Fix, Debug-Logs
// ══════════════════════════════════════════════════════════════════════════════

let pollingTimer = null;
let isRequestInProgress = false;   // 🆕 verhindert doppelte Anfragen

// ─────────────────────────────────────────────────────────────────────────────
// BENACHRICHTIGUNGEN
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

function handleIncomingChatRequest(senderCode, senderName) {
  console.log('📞 handleIncomingChatRequest', senderCode, senderName);

  // 🆕 Prüfen, ob bereits eine Anfrage bearbeitet wird
  if (isRequestInProgress) {
    console.warn('⚠️ Anfrage bereits in Bearbeitung');
    return;
  }

  // Prüfen, ob s-in bereits aktiv
  const sIn = document.getElementById('s-in');
  if (sIn.classList.contains('active')) {
    console.warn('⚠️ s-in bereits aktiv');
    return;
  }

  // Prüfen, ob wir bereits in einem aktiven Chat sind
  if (partnerCode && document.getElementById('s-chat').classList.contains('active')) {
    toast('⚠️ Bereits in einem Chat');
    return;
  }

  isRequestInProgress = true;

  // Partnerdaten setzen
  window.pendingChatPartner = { code: senderCode, name: senderName };

  // s-in‑Screen aktualisieren
  document.getElementById('in-name').textContent = senderName;
  document.getElementById('in-code').textContent = 'Code: ' + formatCode(senderCode);
  document.querySelector('#s-in .caller-hint').textContent = 'möchte mit dir chatten';

  // 🆕 Z-Index erhöhen, damit s-in sicher über allem liegt
  sIn.style.zIndex = '10000';

  showScreen('s-in');
  playChatNotificationSound();
  triggerChatHaptic();
}

// 🆕 Wird von acceptCall/declineCall aufgerufen, um den Zustand zurückzusetzen
function resetIncomingRequestState() {
  isRequestInProgress = false;
  window.pendingChatPartner = null;
  document.getElementById('s-in').style.zIndex = '';
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
// GLOBALES POLLING (jetzt alle 5 Sekunden)
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
          console.log('📩 Chat-Request empfangen von', senderName);
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
  }, 5000);  // 🆕 5 Sekunden statt 15
}

function isMessageAlreadyStored(ts, own) {
  if (!chatId) return false;
  const chatKey = 'smmsg_' + chatId;
  const msgs = JSON.parse(localStorage.getItem(chatKey) || '[]');
  return msgs.some(m => m.ts === ts && m.own === own);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT ÖFFNEN / SCHLIESSEN
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

// Globale Funktionen exportieren
window.openChat = openApiChat;
window.resetIncomingRequestState = resetIncomingRequestState;
