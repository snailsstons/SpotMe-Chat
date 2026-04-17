'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// + pendingConn wird korrekt gesetzt, Chatanfrage funktioniert
// ══════════════════════════════════════════════════════════════════════════════

let peerRetries = 0;
let heartbeatInterval = null;
let autoReconnectPending = false;
let reconnectTimer = null;

function initPeer() {
  if (peer && !peer.destroyed && peer.open) return;
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (e) {}
  }
  peer = null;
  peerReady = false;
  updateConnectionStatus();

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
    console.log('✅ PeerJS open');
    peerRetries = 0;
    isOffline = false;
    peerReady = true;
    showCodeCard(true);
    updateConnectionStatus();
    startHeartbeat();

    if (autoReconnectPending && partnerCode && !conn) {
      autoReconnectPending = false;
      const newConn = peer.connect(partnerCode, { reliable: true, metadata: { name: myName } });
      openChat(newConn);
    }
  });

  peer.on('error', err => {
    console.warn('[peer] error', err.type, err.message);
    peerReady = false;
    if (err.type === 'unavailable-id') {
      peerRetries++;
      const delay = Math.min(3000 * peerRetries, 15000);
      setTimeout(() => { peer = null; initPeer(); }, delay);
      return;
    }
    if (err.type === 'peer-unavailable') {
      if (outgoingCallTimer) {
        clearTimeout(outgoingCallTimer);
        outgoingCallTimer = null;
      }
      return;
    }
    isOffline = true;
    updateConnectionStatus();
    peerRetries++;
    const delay = Math.min(4000 * peerRetries, 20000);
    setTimeout(() => { peer = null; initPeer(); }, delay);
  });

  peer.on('disconnected', () => {
    console.warn('[peer] disconnected – versuche reconnect');
    peerReady = false;
    isOffline = true;
    updateConnectionStatus();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (!peer || !peer.open) {
        peer = null;
        initPeer();
      }
      reconnectTimer = null;
    }, 3000);
  });

  peer.on('connection', incoming => {
    console.log(`📥 Eingehende Verbindung von ${incoming.peer}`);
    if (conn && conn.open) {
      console.log('⚠️ Bestehende Verbindung offen – lehne neue ab');
      incoming.close();
      return;
    }
    pendingConn = incoming;
    const peerName = localName(incoming.peer, incoming.metadata?.name);
    document.getElementById('in-name').textContent = peerName;
    document.getElementById('in-code').textContent = 'Code: ' + formatCode(incoming.peer);
    showScreen('s-in');
    pushNotif(peerName, 'möchte mit dir chatten');
    inAppNotif(peerName, 'Eingehende Chatanfrage');
    playRingingTone();
    triggerHaptic();

    incoming.on('close', () => {
      if (pendingConn === incoming) {
        stopRingingTone();
        addMissed(incoming.peer, localName(incoming.peer, incoming.metadata?.name));
        pendingConn = null;
        showScreen('s-home');
        toast('📵 Verpasste Chatanfrage von ' + localName(incoming.peer, incoming.metadata?.name));
      }
    });
  });
}

// ... (startHeartbeat, tryReconnect, openChat, markAutoReconnect unverändert aus vorheriger Diagnose-Version)
// Ich füge sie hier gekürzt ein, um Platz zu sparen – du kannst sie aus der vorherigen Antwort übernehmen.
