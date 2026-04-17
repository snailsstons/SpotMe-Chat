'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// + Robuste Benachrichtigungen, Chatanfrage funktioniert
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

    // Benachrichtigungen (wenn verfügbar)
    if (typeof pushNotif === 'function') {
      pushNotif(peerName, 'möchte mit dir chatten');
    }
    if (typeof inAppNotif === 'function') {
      inAppNotif(peerName, 'Eingehende Chatanfrage');
    }
    if (typeof playRingingTone === 'function') {
      playRingingTone();
    }
    if (typeof triggerHaptic === 'function') {
      triggerHaptic();
    }

    incoming.on('close', () => {
      if (pendingConn === incoming) {
        if (typeof stopRingingTone === 'function') stopRingingTone();
        if (typeof addMissed === 'function') {
          addMissed(incoming.peer, localName(incoming.peer, incoming.metadata?.name));
        }
        pendingConn = null;
        showScreen('s-home');
        if (typeof toast === 'function') {
          toast('📵 Verpasste Chatanfrage von ' + localName(incoming.peer, incoming.metadata?.name));
        }
      }
    });
  });
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!myCode || !peer?.open) return;
    try {
      await fetch(`${API_BASE}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: myCode })
      });
    } catch (e) {}
  }, 600000);
}

function tryReconnect() {
  if (!partnerCode || !peerReady) return;
  document.getElementById('rcbar').classList.remove('show');
  const newConn = peer.connect(partnerCode, { reliable: true, metadata: { name: myName } });
  openChat(newConn);
}

function openChat(c) {
  console.log(`🚪 openChat aufgerufen, c=${c ? 'DataConnection' : 'null (Lokal)'}`);

  if (conn && conn !== c) {
    console.log('🔄 Schließe alte Verbindung');
    try { conn.close(); } catch (e) {}
  }
  conn = c;

  const chatActive = document.getElementById('s-chat').classList.contains('active');
  if (!chatActive) {
    prepChat();
    showScreen('s-chat');
  }

  if (!c) {
    document.getElementById('sbtn').disabled = false;
    document.getElementById('rcbar').classList.remove('show');
    refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    const h = document.getElementById('ehint');
    if (h) {
      h.innerHTML = `<div class="empty-icon">📴</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Lokaler Modus</div>
        <div class="empty-hint">Nachrichten werden gespeichert und später gesendet</div>`;
    }
    if (!chatActive) updateIdx('');
    updateConnectionStatus();
    return;
  }

  const onOpen = () => {
    console.log('🎉 DataConnection offen – Online-Modus');
    if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    document.getElementById('sbtn').disabled = false;
    document.getElementById('rcbar').classList.remove('show');
    refreshStatusText();
    document.getElementById('pav').className = 'pav';

    if (typeof getContacts === 'function') {
      const alias = getContacts()[partnerCode];
      const netName = conn.metadata?.name || partnerName;
      if (!alias && netName) partnerName = netName;
    }
    if (typeof applyPartnerName === 'function') applyPartnerName();

    const welcomeMsg = localStorage.getItem('sm_welcome_message');
    const welcomeTarget = sessionStorage.getItem('sm_welcome_target');
    if (welcomeMsg && welcomeTarget === partnerCode && conn && conn.open) {
      const m = { t: 'text', text: welcomeMsg, ts: Date.now() };
      conn.send(m);
      if (typeof appendMsg === 'function') appendMsg({ ...m, own: true });
      if (typeof persistMsg === 'function') persistMsg({ ...m, own: true });
      localStorage.removeItem('sm_welcome_message');
      sessionStorage.removeItem('sm_welcome_target');
      if (typeof toast === 'function') toast('👋 Willkommensnachricht gesendet');
    }

    const h = document.getElementById('ehint');
    if (h) {
      h.innerHTML = `<div class="empty-icon">💬</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Verbunden!</div>
        <div class="empty-hint">🔒 P2P · Ende-zu-Ende verschlüsselt</div>`;
    }
    if (!chatActive && typeof updateIdx === 'function') updateIdx('');
    if (typeof toast === 'function') toast('✓ Verbunden');
    if (typeof flushPendingMessages === 'function') flushPendingMessages();
    updateConnectionStatus();
  };

  if (conn.open) {
    onOpen();
  } else {
    conn.on('open', onOpen);
  }

  conn.on('data', d => { if (typeof handleData === 'function') handleData(d); });

  conn.on('close', () => {
    console.log(`🔌 DataConnection zu ${partnerCode} geschlossen`);
    if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    conn = null;
    if (partnerTypingTimer) { clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
    if (typingStarted) { typingStarted = false; if (typingDebounceTimer) clearTimeout(typingDebounceTimer); }
    document.getElementById('sbtn').disabled = true;
    if (typeof refreshStatusText === 'function') refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    if (document.getElementById('s-chat').classList.contains('active')) {
      document.getElementById('rcbar').classList.add('show');
      if (typeof toast === 'function') toast('○ Partner hat den Chat verlassen');
    }
    updateConnectionStatus();
  });

  conn.on('error', err => {
    console.warn('[conn] error', err);
    if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    document.getElementById('rcbar').classList.add('show');
    updateConnectionStatus();
  });
}

function markAutoReconnect() {
  console.log('🏷️ markAutoReconnect gesetzt');
  autoReconnectPending = true;
  }
