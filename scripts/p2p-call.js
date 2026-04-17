'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Öffnet immer den Chat, sendet bei Bedarf Offline‑Nachricht
// ══════════════════════════════════════════════════════════════════════════════

function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  // Chat SOFORT öffnen (Lokal‑Modus)
  openChat(null);
  setSpill('offline', '○ LOCAL');
  updateConnectionStatus();

  // Im Hintergrund P2P‑Verbindung aufbauen (wenn peerReady)
  if (peerReady) {
    const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
    openChat(newConn); // Bestehenden Chat in Online‑Modus überführen
  } else {
    markAutoReconnect();
  }

  // Wenn wir offline sind oder der Partner nicht erreichbar ist, können wir eine Offline‑Nachricht anbieten
  if (!peerReady || !conn || !conn.open) {
    // Optional: Automatisch das "Nachricht hinterlassen"-Sheet öffnen? Oder einfach den Nutzer weiterschreiben lassen.
    // Wir lassen den Nutzer einfach im Chat schreiben – die Nachrichten werden in der Pending‑Queue gespeichert.
  }
}

// acceptCall, declineCall, showLeaveMessageSheet, etc. bleiben unverändert
