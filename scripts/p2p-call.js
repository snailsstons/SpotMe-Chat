'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js) – API‑Version
// Öffnet nur noch den Chat, kein P2P mehr
// ══════════════════════════════════════════════════════════════════════════════

function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  // Chat sofort öffnen
  openApiChat();

  // Eingabefelder leeren
  document.querySelectorAll('.dinp-new').forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
  document.getElementById('cbtn').disabled = true;
}

// Dummy-Funktionen für Kompatibilität
function acceptCall() {}
function declineCall() {}
function tryReconnect() {}
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
    const payload = {
      recipient: partnerCode,
      senderCode: myCode,
      senderName: myName,
      message: text
    };
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      toast(`📨 Nachricht an ${partnerName} gesendet`);
    } else if (res.status === 429) {
      toast('⏳ ' + (data.error || 'Bitte warte etwas'));
    } else {
      toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
    }
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
window.showLeaveMessageSheet = showLeaveMessageSheet;
window.closeLeaveMessageSheet = closeLeaveMessageSheet;
window.submitLeaveMessage = submitLeaveMessage;
