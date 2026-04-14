'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// PeerJS-Initialisierung, Verbindungsaufbau, Heartbeat, Reconnect
// ══════════════════════════════════════════════════════════════════════════════

let peerRetries = 0;
let heartbeatInterval = null;

// ─────────────────────────────────────────────────────────────────────────────
// PeerJS initialisieren
function initPeer() {
  if (peer && !peer.destroyed && peer.open) return;
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch (e) {}
  }
  peer = null;
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
    setSpill('online', '● ONLINE');
    showCodeCard(true);
    updateConnectionStatus();
    startHeartbeat();
  });

  peer.on('error', err => {
    console.warn('[peer]', err.type, err.message);
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
    // Andere Fehler → Local-Modus
    isOffline = true;
    updateConnectionStatus();
    peerRetries++;
    const delay = Math.min(4000 * peerRetries, 20000);
    setSpill('offline', `⚠️ Verbindungsfehler · Retry in ${delay / 1000}s`);
    setTimeout(() => {
      peer = null;
      initPeer();
    }, delay);
  });

  peer.on('disconnected', () => {
    isOffline = true;
    updateConnectionStatus();
    setSpill('connecting', 'Unterbrochen · verbinde erneut...');
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

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat – hält Server wach (Render) und verlängert Sichtbarkeit
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
    } catch (e) {
      // stiller Fehler – Heartbeat ist optional
    }
  }, 600000); // alle 10 Minuten
}

// ─────────────────────────────────────────────────────────────────────────────
// Verbindung wiederherstellen (Button im Chat)
function tryReconnect() {
  if (!partnerCode || !peer || !peer.open) {
    toast('↺ Warte auf Serververbindung...');
    return;
  }
  document.getElementById('rcbar').classList.remove('show');
  toast('↺ Verbinde erneut...');
  openChat(peer.connect(partnerCode, { reliable: true, metadata: { name: myName } }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat öffnen (nach erfolgreichem Verbindungsaufbau)
function openChat(c) {
  if (conn && conn !== c) {
    try { conn.close(); } catch (e) {}
  }
  conn = c;
  prepChat();
  showScreen('s-chat');

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