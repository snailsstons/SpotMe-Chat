'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// PeerJS-Initialisierung, Verbindungsaufbau, Heartbeat, Reconnect
// ══════════════════════════════════════════════════════════════════════════════

let peerRetries = 0;
let heartbeatInterval = null;
let autoReconnectPending = false;

function initPeer() {
  if (peer && !peer.destroyed && peer.open) return;
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (e) {}
  }
  peer = null;
  peerReady = false;
  setSpill('connecting', 'Verbinde mit Server...');

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
    peerRetries = 0;
    isOffline = false;
    peerReady = true;
    setSpill('online', '● ONLINE');
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
    console.warn('[peer]', err.type, err.message);
    peerReady = false;
    if (err.type === 'unavailable-id') {
      peerRetries++;
      const delay = Math.min(3000 * peerRetries, 15000);
      setSpill('connecting', `Code kurz belegt · Neuer Versuch in ${delay / 1000}s...`);
      setTimeout(() => {
        peer = null;
        initPeer();
      }, delay);
      return;
    }
    if (err.type === 'peer-unavailable') {
      if (outgoingCallTimer) {
        clearTimeout(outgoingCallTimer);
        outgoingCallTimer = null;
      }
      toast('⚠️ Partner nicht erreichbar');
      addMissed(partnerCode, partnerName, true);
      if (conn) {
        try { conn.close(); } catch (e) {}
        conn = null;
      }
      showLeaveMessageSheet(partnerCode, partnerName);
      return;
    }
    // Alle anderen Fehler → still in Local-Modus wechseln, KEINE Toast-Meldung
    isOffline = true;
    updateConnectionStatus();
    peerRetries++;
    const delay = Math.min(4000 * peerRetries, 20000);
    // Status nur auf LOCAL setzen, keine Fehlermeldung
    setSpill('offline', '○ LOCAL');
    setTimeout(() => {
      peer = null;
      initPeer();
    }, delay);
  });

  peer.on('disconnected', () => {
    peerReady = false;
    isOffline = true;
    updateConnectionStatus();
    setSpill('offline', '○ LOCAL');  // ← Statt "Unterbrochen · verbinde erneut..."
    setTimeout(() => {
      peer = null;
      initPeer();
    }, 2500);
  });

  peer.on('connection', incoming => {
    if (conn && conn.open) {
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
  // Wenn offline, einfach lokal weitermachen – keine Toast-Meldung
  if (!partnerCode || !peerReady) {
    // Leise nichts tun, Status bleibt auf LOCAL
    return;
  }
  document.getElementById('rcbar').classList.remove('show');
  // Kurze Info, aber nicht störend
  toast('↺ Verbinde erneut...', 1500);
  openChat(peer.connect(partnerCode, { reliable: true, metadata: { name: myName } }));
}

function openChat(c) {
  if (conn && conn !== c) {
    try { conn.close(); } catch (e) {}
  }
  conn = c;
  prepChat();
  showScreen('s-chat');

  if (!c) {
    document.getElementById('sbtn').disabled = true;
    document.getElementById('rcbar').classList.remove('show');
    refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    const h = document.getElementById('ehint');
    if (h) {
      h.innerHTML = `<div class="empty-icon">📴</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Lokaler Modus</div>
        <div class="empty-hint">Nachrichten werden gespeichert und später gesendet</div>`;
    }
    updateIdx('');
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
    return;
  }

  const onOpen = () => {
    if (outgoingCallTimer) {
      clearTimeout(outgoingCallTimer);
      outgoingCallTimer = null;
    }
    document.getElementById('sbtn').disabled = false;
    document.getElementById('rcbar').classList.remove('show');
    refreshStatusText();
    document.getElementById('pav').className = 'pav';

    const alias = getContacts()[partnerCode];
    const netName = conn.metadata?.name || partnerName;
    if (!alias && netName) partnerName = netName;
    applyPartnerName();

    const h = document.getElementById('ehint');
    if (h) {
      h.innerHTML = `<div class="empty-icon">💬</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Verbunden!</div>
        <div class="empty-hint">🔒 P2P · Ende-zu-Ende verschlüsselt</div>`;
    }
    updateIdx('');
    toast('✓ Verbunden');
    flushPendingMessages();
    setSpill('online', '● ONLINE');
    updateConnectionStatus();
  };

  if (conn.open) {
    onOpen();
  } else {
    conn.on('open', onOpen);
  }

  conn.on('data', d => handleData(d));

  conn.on('close', () => {
    if (outgoingCallTimer) {
      clearTimeout(outgoingCallTimer);
      outgoingCallTimer = null;
    }
    conn = null;
    if (partnerTypingTimer) {
      clearTimeout(partnerTypingTimer);
      partnerTypingTimer = null;
    }
    if (typingStarted) {
      typingStarted = false;
      if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
    }
    document.getElementById('sbtn').disabled = true;
    refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    if (document.getElementById('s-chat').classList.contains('active')) {
      document.getElementById('rcbar').classList.add('show');
      toast('○ Partner hat den Chat verlassen');
    }
    updateConnectionStatus();
  });

  conn.on('error', err => {
    console.warn('[conn]', err);
    if (outgoingCallTimer) {
      clearTimeout(outgoingCallTimer);
      outgoingCallTimer = null;
    }
    document.getElementById('rcbar').classList.add('show');
    updateConnectionStatus();
  });
}

function markAutoReconnect() {
  autoReconnectPending = true;
}