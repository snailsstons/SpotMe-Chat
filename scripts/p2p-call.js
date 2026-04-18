'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Großes, zentriertes Modal für "Rufe Partner…" (5 Sekunden)
// ══════════════════════════════════════════════════════════════════════════════

let callModalTimer = null;

// 🆕 Zeigt ein großes, zentriertes Modal für 5 Sekunden
function showCallModal(title, message) {
  // Altes Modal entfernen
  const oldModal = document.getElementById('call-info-modal');
  if (oldModal) oldModal.remove();
  if (callModalTimer) clearTimeout(callModalTimer);

  const modal = document.createElement('div');
  modal.id = 'call-info-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    z-index: 10000;
    animation: fadeIn 0.2s ease;
  `;

  modal.innerHTML = `
    <div style="
      background: var(--card, #111a22);
      padding: 32px 24px;
      border-radius: 32px;
      max-width: 320px;
      width: 90%;
      text-align: center;
      border: 1px solid var(--bord, #26313e);
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      animation: scaleIn 0.3s ease;
    ">
      <div style="font-size: 4rem; margin-bottom: 16px;">📞</div>
      <h2 style="margin: 0 0 8px 0; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1.5rem; color: var(--text, #f0f4fa);">${title}</h2>
      <p style="margin: 0; color: var(--text-dim, #9aabbc); font-size: 1rem;">${message}</p>
      <div style="margin-top: 24px;">
        <div style="width: 40px; height: 4px; background: var(--acc, #00e5c0); border-radius: 4px; margin: 0 auto; animation: pulse 1.5s infinite;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Nach 5 Sekunden automatisch ausblenden
  callModalTimer = setTimeout(() => {
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.3s';
    setTimeout(() => modal.remove(), 300);
    callModalTimer = null;
  }, 5000);

  // Bei Klick auf Hintergrund ebenfalls schließen
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      clearTimeout(callModalTimer);
      modal.remove();
      callModalTimer = null;
    }
  });
}

// CSS-Animationen hinzufügen (falls nicht bereits in styles.css)
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes scaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;
document.head.appendChild(style);

// ─────────────────────────────────────────────────────────────────────────────
// VERBINDUNGSAUFBAU
function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;

  // 🆕 Großes Modal anzeigen
  showCallModal('📞 Rufe Partner', `${localName(code)} (${formatCode(code)})`);

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  openApiChat();

  if (myToken) {
    sendChatRequest(partnerCode);
  } else {
    toast('⚠️ Profil nicht veröffentlicht – Partner wird nicht benachrichtigt.');
  }

  document.querySelectorAll('.dinp-new').forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
  document.getElementById('cbtn').disabled = true;
}

async function sendChatRequest(recipient) {
  try {
    await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        senderCode: myCode,
        senderName: myName,
        message: '__CHAT_REQUEST__',
        type: 'chat_request'
      })
    });
  } catch (e) {}
}

function acceptCall() {
  const pending = window.pendingChatPartner;
  if (!pending) return;

  if (typeof stopChatPolling === 'function') stopChatPolling();

  partnerCode = pending.code;
  partnerName = pending.name;
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages();
  migratePendingMessages(chatId);

  openApiChat();

  if (typeof resetIncomingRequestState === 'function') {
    resetIncomingRequestState();
  } else {
    window.pendingChatPartner = null;
  }
}

function declineCall() {
  const pending = window.pendingChatPartner;
  if (pending) {
    addMissed(pending.code, pending.name);
    toast('📵 Chat-Anfrage abgelehnt');
  }

  if (typeof resetIncomingRequestState === 'function') {
    resetIncomingRequestState();
  } else {
    window.pendingChatPartner = null;
  }
  showScreen('s-home');
}

// Dummy-Funktionen
function tryReconnect() {}
function markAutoReconnect() {}

function showLeaveMessageSheet(code, name) {
  partnerCode = code;
  partnerName = name;
  document.getElementById('leave-message-input').value = '';
  document.getElementById('leave-message-ovl').classList.add('open');
  document.getElementById('leave-message-sheet').classList.add('open');
  setTimeout(() => document.getElementById('leave-message-input').focus(), 100);
}

function closeLeaveMessageSheet() {
  document.getElementById('leave-message-ovl').classList.remove('open');
  document.getElementById('leave-message-sheet').classList.remove('open');
  showScreen('s-home');
  updateConnectionStatus();
}

async function submitLeaveMessage() {
  const input = document.getElementById('leave-message-input');
  const text = input.value.trim();
  if (!text) { toast('Bitte eine Nachricht eingeben'); return; }
  const btn = document.getElementById('leave-msg-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Senden...'; }
  try {
    const payload = { recipient: partnerCode, senderCode: myCode, senderName: myName, message: text };
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) toast(`📨 Nachricht an ${partnerName} gesendet`);
    else if (res.status === 429) toast('⏳ ' + (data.error || 'Bitte warte etwas'));
    else toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
  } catch (e) {
    toast('⚠️ Keine Verbindung zum Server');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Senden'; }
  }
  closeLeaveMessageSheet();
  showScreen('s-home');
  updateConnectionStatus();
}

window.connectToPeer = connectToPeer;
window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.tryReconnect = tryReconnect;
window.markAutoReconnect = markAutoReconnect;
window.showLeaveMessageSheet = showLeaveMessageSheet;
window.closeLeaveMessageSheet = closeLeaveMessageSheet;
window.submitLeaveMessage = submitLeaveMessage;
