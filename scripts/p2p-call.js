'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + acceptCall / declineCall für Chatanfragen
// ══════════════════════════════════════════════════════════════════════════════

function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;

  console.log(`📞 connectToPeer: ${code}, peerReady=${peerReady}`);

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  // Chat sofort im Lokal‑Modus öffnen
  console.log('📴 Öffne Chat im Lokal‑Modus');
  openChat(null);
  setSpill('offline', '○ LOCAL');
  updateConnectionStatus();

  // Verbindung im Hintergrund aufbauen
  if (peerReady) {
    console.log('🔄 Peer ist bereit, starte peer.connect');
    const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
    console.log('📡 peer.connect aufgerufen, newConn:', newConn);
    openChat(newConn);
  } else {
    console.log('⏳ Peer noch nicht bereit, markiere AutoReconnect');
    markAutoReconnect();
  }
}

// 🆕 Eingehende Chatanfrage annehmen
function acceptCall() {
  console.log('✅ acceptCall aufgerufen');
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

// 🆕 Eingehende Chatanfrage ablehnen
function declineCall() {
  console.log('❌ declineCall aufgerufen');
  stopRingingTone();
  if (pendingConn) {
    const c = pendingConn;
    pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try { c.close(); } catch (e) {}
  }
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
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Senden';
    }
  }
  closeLeaveMessageSheet();
  showScreen('s-home');
  updateConnectionStatus();
    }
