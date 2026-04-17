'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// + markAutoReconnect, openChat (unterstützt Lokal‑Modus)
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

  // Fehlerbehandlung, disconnect, connection etc. bleiben unverändert
  // (Aus Platzgründen hier nicht vollständig wiederholt)

  peer.on('connection', incoming => {
    if (conn && conn.open) { incoming.close(); return; }
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
  if (!partnerCode || !peerReady) return;
  document.getElementById('rcbar').classList.remove('show');
  openChat(peer.connect(partnerCode, { reliable: true, metadata: { name: myName } }));
}

function openChat(c) {
  if (conn && conn !== c) {
    try { conn.close(); } catch (e) {}
  }
  conn = c;

  const chatActive = document.getElementById('s-chat').classList.contains('active');
  if (!chatActive) {
    prepChat();
    showScreen('s-chat');
  }

  if (!c) {
    // Lokaler Modus
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

    const alias = getContacts()[partnerCode];
    const netName = conn.metadata?.name || partnerName;
    if (!alias && netName) partnerName = netName;
    applyPartnerName();

    const welcomeMsg = localStorage.getItem('sm_welcome_message');
    const welcomeTarget = sessionStorage.getItem('sm_welcome_target');
    if (welcomeMsg && welcomeTarget === partnerCode && conn && conn.open) {
      const m = { t: 'text', text: welcomeMsg, ts: Date.now() };
      conn.send(m);
      appendMsg({ ...m, own: true });
      persistMsg({ ...m, own: true });
      localStorage.removeItem('sm_welcome_message');
      sessionStorage.removeItem('sm_welcome_target');
      toast('👋 Willkommensnachricht gesendet');
    }

    const h = document.getElementById('ehint');
    if (h) {
      h.innerHTML = `<div class="empty-icon">💬</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Verbunden!</div>
        <div class="empty-hint">🔒 P2P · Ende-zu-Ende verschlüsselt</div>`;
    }
    if (!chatActive) updateIdx('');
    toast('✓ Verbunden');
    flushPendingMessages();
    updateConnectionStatus();
  };

  if (conn.open) {
    onOpen();
  } else {
    conn.on('open', onOpen);
  }

  conn.on('data', d => handleData(d));

  conn.on('close', () => {
    if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    conn = null;
    if (partnerTypingTimer) { clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
    if (typingStarted) { typingStarted = false; if (typingDebounceTimer) clearTimeout(typingDebounceTimer); }
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
