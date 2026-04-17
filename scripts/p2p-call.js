'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Logs zur Fehlersuche
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

  // Chat SOFORT im Lokal‑Modus öffnen
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

// acceptCall, declineCall, showLeaveMessageSheet, closeLeaveMessageSheet, submitLeaveMessage unverändert
// ...
