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
        if (typeof openChat === 'function') {
          openChat(newConn);
        } else {
          console.error('❌ openChat ist keine Funktion! Fallback Lokalmodus');
          openChatFallback();
        }
      } else {
        console.warn('❌ newConn ist null – fallback Lokalmodus');
        openChatFallback();
      }
    } catch (e) {
      console.error('❌ peer.connect Exception:', e);
      openChatFallback();
    }
  } else {
    console.log('⏳ Peer nicht bereit – Lokalmodus');
    openChatFallback();
  }

  setTimeout(() => { if (btn) btn.disabled = false; isConnecting = false; }, 3000);
}

function openChatFallback() {
  console.log('📴 Fallback: Lokalmodus');
  if (typeof openChat === 'function') {
    openChat(null);
  } else {
    // Notfall: UI manuell auf Lokalmodus setzen
    if (typeof prepChat === 'function') prepChat();
    showScreen('s-chat');
    document.getElementById('sbtn').disabled = false;
    document.getElementById('rcbar').classList.remove('show');
    if (typeof refreshStatusText === 'function') refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    const h = document.getElementById('ehint');
    if (h) h.innerHTML = `<div class="empty-icon">📴</div><div class="empty-txt">Lokaler Modus</div>`;
    if (typeof updateIdx === 'function') updateIdx('');
  }
  setSpill('offline', '○ LOCAL');
  updateConnectionStatus();
  if (typeof markAutoReconnect === 'function') markAutoReconnect();
}

function acceptCall() {
  console.log('✅ acceptCall called');
  stopRingingTone();
  if (!pendingConn) return;
  const c = pendingConn; pendingConn = null;
  partnerCode = c.peer; partnerName = localName(c.peer, c.metadata?.name);
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages(); migratePendingMessages(chatId);
  openChat(c);
}

function declineCall() {
  console.log('❌ declineCall called');
  stopRingingTone();
  if (pendingConn) {
    const c = pendingConn; pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try { c.close(); } catch (e) {}
  }
  showScreen('s-home');
}

// ... (showLeaveMessageSheet, closeLeaveMessageSheet, submitLeaveMessage unverändert)

window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.connectToPeer = connectToPeer;
