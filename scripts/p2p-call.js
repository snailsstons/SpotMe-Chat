'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Schutz vor Mehrfachaufrufen, stabile Lokal/Online-Umschaltung
// ══════════════════════════════════════════════════════════════════════════════

let isConnecting = false; // Verhindert parallele Verbindungsversuche

function connectToPeer() {
  if (isConnecting) {
    console.warn('⚠️ connectToPeer bereits aktiv, ignoriere erneuten Aufruf');
    return;
  }
  isConnecting = true;

  console.log('📞 connectToPeer called, peerReady:', peerReady);
  const code = getDigits();
  if (code.length !== 6 || code === myCode) {
    isConnecting = false;
    return;
  }

  // Button deaktivieren, um Mehrfachklicks zu verhindern
  const btn = document.getElementById('cbtn');
  if (btn) btn.disabled = true;

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  // Bestehende Verbindung schließen
  if (conn) {
    try { conn.close(); } catch (e) {}
    conn = null;
  }

  if (peerReady) {
    console.log('🔄 Peer ist bereit, starte peer.connect zu', code);
    const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
    openChat(newConn);
  } else {
    console.log('⏳ Peer nicht bereit – öffne Lokal‑Modus');
    openChat(null);
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
    markAutoReconnect();
  }

  // Button nach kurzer Zeit wieder aktivieren (falls Verbindung fehlschlägt)
  setTimeout(() => {
    if (btn) btn.disabled = false;
    isConnecting = false;
  }, 3000);
}

function acceptCall() {
  console.log('✅ acceptCall called');
  stopRingingTone();
  if (!pendingConn) return;
  const c = pendingConn;
  pendingConn = null;
  partnerCode = c.peer;
  partnerName = localName(c.peer, c.metadata?.name);
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages();
  migratePendingMessages(chatId);
  openChat(c);
}

function declineCall() {
  console.log('❌ declineCall called');
  stopRingingTone();
  if (pendingConn) {
    const c = pendingConn;
    pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try { c.close(); } catch (e) {}
  }
  showScreen('s-home');
}

// ... (showLeaveMessageSheet, closeLeaveMessageSheet, submitLeaveMessage unverändert)

window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.connectToPeer = connectToPeer;
