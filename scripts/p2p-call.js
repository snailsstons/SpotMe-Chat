'use strict';

let isConnecting = false;

function connectToPeer() {
  if (isConnecting) { console.warn('⚠️ bereits aktiv'); return; }
  isConnecting = true;

  console.log('📞 connectToPeer, peerReady:', peerReady, 'peer:', peer);
  const code = getDigits();
  if (code.length !== 6 || code === myCode) { isConnecting = false; return; }

  const btn = document.getElementById('cbtn');
  if (btn) btn.disabled = true;

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  if (conn) { try { conn.close(); } catch (e) {} conn = null; }

  if (peerReady && peer) {
    console.log('🔄 starte peer.connect zu', code);
    try {
      const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
      console.log('newConn:', newConn);
      if (newConn) {
        console.log('✅ öffne Online-Chat');
        openChat(newConn);
      } else {
        console.warn('❌ newConn ist null – fallback Lokalmodus');
        openChat(null);
        setSpill('offline', '○ LOCAL');
        updateConnectionStatus();
        markAutoReconnect();
      }
    } catch (e) {
      console.error('❌ peer.connect Exception:', e);
      openChat(null);
      setSpill('offline', '○ LOCAL');
      updateConnectionStatus();
      markAutoReconnect();
    }
  } else {
    console.log('⏳ Peer nicht bereit – Lokalmodus');
    openChat(null);
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
    markAutoReconnect();
  }

  setTimeout(() => { if (btn) btn.disabled = false; isConnecting = false; }, 3000);
}

function acceptCall() { /* ... unverändert ... */ }
function declineCall() { /* ... unverändert ... */ }
// ... restliche Funktionen unverändert ...

window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.connectToPeer = connectToPeer;
