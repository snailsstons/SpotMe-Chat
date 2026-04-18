'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// + Stabilere Peer-Initialisierung, garantierte peer.connect-Verfügbarkeit
// ══════════════════════════════════════════════════════════════════════════════

let peerRetries = 0;
let heartbeatInterval = null;
let autoReconnectPending = false;
let peerInitInProgress = false;

function initPeer() {
  if (peerInitInProgress) return;
  if (peer && !peer.destroyed && peer.open) return;
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (e) {}
  }
  peer = null;
  peerReady = false;
  peerInitInProgress = true;
  updateConnectionStatus();

  console.log('🆕 initPeer: Erstelle neuen Peer mit ID', myCode);
  peer = new Peer(myCode, {
    host: SERVER_HOST,
    port: 443,
    path: SERVER_PATH,
    secure: true,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    }
  });

  peer.on('open', () => {
    console.log('✅ PeerJS open – ID:', peer.id);
    peerRetries = 0;
    isOffline = false;
    peerReady = true;
    peerInitInProgress = false;
    showCodeCard(true);
    updateConnectionStatus();
    startHeartbeat();

    if (autoReconnectPending && partnerCode && !conn) {
      autoReconnectPending = false;
      console.log('🔄 autoReconnectPending – versuche Verbindung zu', partnerCode);
      const newConn = peer.connect(partnerCode, { reliable: true, metadata: { name: myName } });
      openChat(newConn);
    }
  });

  peer.on('error', err => {
    console.warn('[peer] error', err.type, err.message);
    peerReady = false;
    peerInitInProgress = false;
    if (err.type === 'unavailable-id') {
      peerRetries++;
      const delay = Math.min(3000 * peerRetries, 15000);
      setTimeout(() => { peer = null; initPeer(); }, delay);
      return;
    }
    if (err.type === 'peer-unavailable') {
      if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
      return;
    }
    isOffline = true;
    updateConnectionStatus();
    peerRetries++;
    const delay = Math.min(4000 * peerRetries, 20000);
    setTimeout(() => { peer = null; initPeer(); }, delay);
  });

  peer.on('disconnected', () => {
    console.warn('[peer] disconnected');
    peerReady = false;
    isOffline = true;
    updateConnectionStatus();
    setTimeout(() => { peer = null; initPeer(); }, 2500);
  });

  peer.on('connection', incoming => {
    console.log('📥 Eingehende Verbindung von', incoming.peer);
    if (conn && conn.open) {
      console.log('⚠️ Bestehende Verbindung offen – lehne neue ab');
      incoming.close();
      return;
    }
    pendingConn = incoming;
    partnerCode = incoming.peer;
    partnerName = localName(incoming.peer, incoming.metadata?.name);
    document.getElementById('in-name').textContent = partnerName;
    document.getElementById('in-code').textContent = 'Code: ' + formatCode(partnerCode);
    showScreen('s-in');
    pushNotif(partnerName, 'möchte mit dir chatten');
    inAppNotif(partnerName, 'Eingehender Chat');
    playRingingTone();
    triggerHaptic();

    incoming.on('close', () => {
      if (pendingConn === incoming) {
        stopRingingTone();
        addMissed(incoming.peer, localName(incoming.peer, incoming.metadata?.name));
        pendingConn = null;
        showScreen('s-home');
        toast('📵 Verpasster Anruf von ' + localName(incoming.peer, incoming.metadata?.name));
      }
    });
  });
}

// startHeartbeat, tryReconnect, openChat, markAutoReconnect unverändert (wie in deiner letzten p2p-core.js)
// ...
