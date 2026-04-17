'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Stabiler Wechsel von Lokal zu Online (Chat wird nur einmal geöffnet)
// ══════════════════════════════════════════════════════════════════════════════

function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  // Chat SOFORT im Lokal‑Modus öffnen (falls nicht bereits offen)
  if (!conn) {
    openChat(null);
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
  }

  // Peer-Verbindung im Hintergrund aufbauen
  if (peerReady) {
    const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
    // Bestehenden Chat in Online‑Modus überführen
    if (conn !== newConn) {
      openChat(newConn);
    }
  } else {
    markAutoReconnect();
  }
}

// acceptCall, declineCall, showLeaveMessageSheet, closeLeaveMessageSheet, submitLeaveMessage unverändert
// (wie in deiner aktuellen p2p-call.js)
