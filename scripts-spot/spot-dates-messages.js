'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT DATES – PRIVATE NACHRICHTEN (spot-dates-messages.js)
// Senden + Empfangen + Polling für den Dates-Spot
// ══════════════════════════════════════════════════════════════════════════════

const MSG_POLL_INTERVAL = 60000; // 60 Sekunden
const UNREAD_KEY = 'sm_unread_kurznachrichten_dates';

// API-URL: im Spot-Kontext heißt die Variable API, im Chat-Kontext API_BASE
const _MSG_API = (typeof API_BASE !== 'undefined') ? API_BASE
              : (typeof API     !== 'undefined') ? API
              : 'https://spotme-chat-obom.onrender.com/api';

// ══════════════════════════════════════════════════════════════════════════════
// TOKEN-HILFSFUNKTION – prüft dates-spezifischen Token, sonst globalen
// ══════════════════════════════════════════════════════════════════════════════
function getToken() {
  return localStorage.getItem('sm_token_dates') || localStorage.getItem('sm_token');
}

// ══════════════════════════════════════════════════════════════════════════════
// NACHRICHT SENDEN
// ══════════════════════════════════════════════════════════════════════════════

async function sendPrivateMessage(recipientCode, recipientName, messageText) {
  const token = getToken();
  const code  = localStorage.getItem('sm_code');
  const name  = localStorage.getItem('sm_name') || 'Ich';
  
  if (!token || !code || !recipientCode || !messageText) {
    console.warn('Fehlende Daten für private Nachricht');
    return { success: false, error: 'Fehlende Daten' };
  }
  
  try {
    const res = await fetch(`${_MSG_API}/offline-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: recipientCode,
        senderCode: code,
        senderName: name,
        message: messageText.trim().slice(0, 280),
        type: 'spot_message',
        source: 'spot',
        spot: 'dates'
      })
    });
    
    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (e) {
    return { success: false, error: 'Netzwerkfehler' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NACHRICHTEN ABRUFEN
// ══════════════════════════════════════════════════════════════════════════════

async function fetchPrivateMessages() {
  const token = getToken();
  const code  = localStorage.getItem('sm_code');
  if (!token || !code) return [];
  
  try {
    const res = await fetch(`${_MSG_API}/offline-messages/${code}?spot=dates&token=${encodeURIComponent(token)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POLLING (neue Nachrichten erkennen und Badge aktualisieren)
// ══════════════════════════════════════════════════════════════════════════════

let msgPollTimer = null;

function startMessagePolling() {
  if (msgPollTimer) clearInterval(msgPollTimer);
  
  const poll = async () => {
    const messages = await fetchPrivateMessages();
    const unread = messages.filter(m => !m.read).length;
    localStorage.setItem(UNREAD_KEY, String(unread));

    // Header-Badge aktualisieren
    const badge = document.getElementById('header-msg-badge');
    const countEl = document.getElementById('header-msg-count');
    if (badge && countEl) {
      if (unread > 0) {
        badge.style.display = 'flex';
        countEl.textContent = unread;
      } else {
        badge.style.display = 'none';
      }
    }
  };
  
  poll();
  msgPollTimer = setInterval(poll, MSG_POLL_INTERVAL);
}

function stopMessagePolling() {
  if (msgPollTimer) clearInterval(msgPollTimer);
}

// ══════════════════════════════════════════════════════════════════════════════
// KOMPATIBILITÄT mit spot-init.js – stilles Polling wird bereits erledigt
// ══════════════════════════════════════════════════════════════════════════════
window.fetchAndRenderOfflineMsgsSilent = async function() {
  // Wird von spot-init.js alle 60s aufgerufen. Unser eigenes Polling läuft
  // bereits über startMessagePolling(), daher lassen wir diese Funktion leer.
};

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════

// Alte globale Funktionen überschreiben, falls sie von spot-kurznachricht.js gesetzt wurden
window.showKurznachrichtModal = function(code, name) {
  // Modal-Logik aus spot-kurznachricht.js übernehmen, aber sendPrivateMessage nutzen
  const token = getToken();
  if (!token) {
    if (typeof toast === 'function') toast('⚠️ Bitte zuerst dein Profil veröffentlichen');
    return;
  }
  
  const input = document.getElementById('kurznachr-input');
  const modal = document.getElementById('kurznachricht-modal');
  if (!input || !modal) return;
  
  document.getElementById('kurznachr-name').textContent = name;
  input.value = '';
  document.getElementById('kurznachr-chars').textContent = '280';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 100);
  
  // Senden-Button neu binden
  const btn = document.getElementById('kurznachr-btn');
  btn.onclick = async function() {
    const text = input.value.trim();
    if (!text) return;
    const result = await sendPrivateMessage(code, name, text);
    if (result.success) {
      input.value = '';
      modal.style.display = 'none';
      if (typeof toast === 'function') toast(`📨 Nachricht an ${name} gesendet`);
    } else {
      if (typeof toast === 'function') toast('⚠️ ' + (result.error || 'Fehler'));
    }
  };
};

// Erst starten wenn Token vorhanden (Token kann beim Laden noch fehlen)
if (getToken()) {
  startMessagePolling();
} else {
  // Auf Token warten — alle 500ms prüfen, max. 10 Sekunden
  let _waitAttempts = 0;
  const _waitForToken = setInterval(() => {
    _waitAttempts++;
    if (getToken()) {
      clearInterval(_waitForToken);
      startMessagePolling();
    } else if (_waitAttempts >= 20) {
      clearInterval(_waitForToken);
    }
  }, 500);
}

// ══════════════════════════════════════════════════════════════════════════════
// KOMPATIBILITÄT: Alte Aufrufe von fetchAndRenderOfflineMsgs() auf neue Logik umleiten
// ══════════════════════════════════════════════════════════════════════════════
window.fetchAndRenderOfflineMsgs = async function() {
  const messages = await fetchPrivateMessages();
  // Card-Ansicht neu rendern, falls Funktion verfügbar
  if (typeof renderCurrentCard === 'function') {
    renderCurrentCard();
  }
};
console.log('✅ spot-dates-messages.js geladen – Private Nachrichten für Dates');
