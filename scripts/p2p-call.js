'use strict';

console.log('✅ p2p-call.js v3.0 geladen');

let callModalTimer = null;

function showCallModal(title, message) {
  const oldModal = document.getElementById('call-info-modal');
  if (oldModal) oldModal.remove();
  if (callModalTimer) clearTimeout(callModalTimer);

  const modal = document.createElement('div');
  modal.id = 'call-info-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);
    z-index: 10000; animation: fadeIn 0.2s ease;
  `;

  modal.innerHTML = `
    <div style="background: var(--card, #111a22); padding: 32px 24px; border-radius: 32px; max-width: 320px; width: 90%; text-align: center; border: 1px solid var(--bord, #26313e); box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
      <div style="font-size: 4rem; margin-bottom: 16px;">📞</div>
      <h2 style="margin: 0 0 8px 0; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1.5rem; color: var(--text, #f0f4fa);">${title}</h2>
      <p style="margin: 0; color: var(--text-dim, #9aabbc); font-size: 1rem;">${message}</p>
      <div style="margin-top: 24px;"><div style="width: 40px; height: 4px; background: var(--acc, #00e5c0); border-radius: 4px; margin: 0 auto; animation: pulse 1.5s infinite;"></div></div>
    </div>
  `;

  document.body.appendChild(modal);

  callModalTimer = setTimeout(() => {
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.3s';
    setTimeout(() => modal.remove(), 300);
    callModalTimer = null;
  }, 5000);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      clearTimeout(callModalTimer);
      modal.remove();
      callModalTimer = null;
    }
  });
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
  resetIncomingRequestState();
}

function declineCall() {
  const pending = window.pendingChatPartner;
  if (pending) {
    addMissed(pending.code, pending.name);
    toast('📵 Chat-Anfrage abgelehnt');
  }
  resetIncomingRequestState();
  showScreen('s-home');
}

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
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: partnerCode, senderCode: myCode, senderName: myName, message: text })
    });
    if (res.ok) toast(`📨 Nachricht an ${partnerName} gesendet`);
    else toast('⚠️ Fehler beim Senden');
  } catch (e) {
    toast('⚠️ Keine Verbindung');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Senden'; }
  }
  closeLeaveMessageSheet();
}

window.showCallModal = showCallModal;
window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.showLeaveMessageSheet = showLeaveMessageSheet;
window.closeLeaveMessageSheet = closeLeaveMessageSheet;
window.submitLeaveMessage = submitLeaveMessage;
