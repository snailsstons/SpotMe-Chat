'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – ANRUFE (p2p-call.js)
// Ausgehende & eingehende Anrufe, Klingelton, Nachricht hinterlassen
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Ausgehender Anruf (von Home-Screen)
function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;
  if (!peer || !peer.open) {
    toast('⚠️ Noch nicht verbunden');
    return;
  }
  if (outgoingCallTimer) clearTimeout(outgoingCallTimer);

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
  openChat(newConn);
  setSpill('online', `📞 Rufe ${partnerName} an...`);

  outgoingCallTimer = setTimeout(() => {
    outgoingCallTimer = null;
    if (!conn || !conn.open) {
      toast('⏰ Keine Antwort');
      addMissed(partnerCode, partnerName, true);
      if (conn) {
        try { conn.close(); } catch (e) {}
        conn = null;
      }
      showLeaveMessageSheet(partnerCode, partnerName);
    }
    setSpill('online', '● ONLINE');
  }, 30000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Eingehenden Anruf annehmen
function acceptCall() {
  stopRingingTone();
  if (!pendingConn) {
    toast('⚠️ Verbindung nicht mehr verfügbar');
    return;
  }
  const c = pendingConn;
  pendingConn = null;
  partnerCode = c.peer;
  partnerName = localName(c.peer, c.metadata?.name);
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages();
  migratePendingMessages(chatId);
  openChat(c);
}

// Eingehenden Anruf ablehnen
function declineCall() {
  stopRingingTone();
  if (pendingConn) {
    const c = pendingConn;
    pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try { c.close(); } catch (e) {}
  }
  showScreen('s-home');
}

// ─────────────────────────────────────────────────────────────────────────────
// Nachricht hinterlassen (wenn Partner nicht erreichbar)
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
  setSpill('online', '● ONLINE');
}

async function submitLeaveMessage() {
  const input = document.getElementById('leave-message-input');
  const text = input.value.trim();
  if (!text) {
    toast('Bitte eine Nachricht eingeben');
    return;
  }
  const btn = document.getElementById('leave-msg-send-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Senden...';
  }
  try {
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: partnerCode,
        senderCode: myCode,
        senderName: myName,
        message: text
      })
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
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Senden';
    }
  }
  closeLeaveMessageSheet();
  showScreen('s-home');
  setSpill('online', '● ONLINE');
}