'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Schutz vor Mehrfachaufrufen, Fehlerprüfung bei peer.connect
// ══════════════════════════════════════════════════════════════════════════════

let isConnecting = false;

function connectToPeer() {
  if (isConnecting) {
    console.warn('⚠️ connectToPeer bereits aktiv');
    return;
  }
  isConnecting = true;

  console.log('📞 connectToPeer called, peerReady:', peerReady);
  const code = getDigits();
  if (code.length !== 6 || code === myCode) {
    isConnecting = false;
    return;
  }

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

  if (peerReady && peer) {
    console.log('🔄 Peer ist bereit, starte peer.connect zu', code);
    try {
      const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
      if (newConn) {
        console.log('✅ peer.connect erfolgreich, öffne Online-Chat');
        openChat(newConn);
      } else {
        throw new Error('peer.connect gab null/undefined zurück');
      }
    } catch (e) {
      console.warn('❌ peer.connect fehlgeschlagen:', e);
      // Fallback: Lokalmodus
      openChat(null);
      setSpill('offline', '○ LOCAL');
      updateConnectionStatus();
      markAutoReconnect();
    }
  } else {
    console.log('⏳ Peer nicht bereit – öffne Lokal‑Modus');
    openChat(null);
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
    markAutoReconnect();
  }

  // Button nach kurzer Zeit wieder aktivieren
  setTimeout(() => {
    if (btn) btn.disabled = false;
    isConnecting = false;
  }, 3000);
}

// acceptCall, declineCall, ... unverändert
// ...

window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.connectToPeer = connectToPeer;
