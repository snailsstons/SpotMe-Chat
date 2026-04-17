'use strict';

function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;
  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);
  openChat(null);
  if (peerReady) {
    const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
    openChat(newConn);
  } else {
    markAutoReconnect();
  }
}

function acceptCall() {
  stopRingingTone();
  if (!pendingConn) return;
  const c = pendingConn; pendingConn = null;
  partnerCode = c.peer; partnerName = localName(c.peer, c.metadata?.name);
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages(); migratePendingMessages(chatId);
  openChat(c);
}

function declineCall() {
  stopRingingTone();
  if (pendingConn) {
    const c = pendingConn; pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try { c.close(); } catch(e) {}
  }
  showScreen('s-home');
}
