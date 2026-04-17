'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// PeerJS-Initialisierung, Verbindungsaufbau, Heartbeat, Reconnect
// + Detaillierte Logs + Korrektur: startHeartbeat definiert
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
    console.log('✅ PeerJS open – Verbindung zum Server hergestellt');
    peerRetries = 0;
    isOffline = false;
    peerReady = true;
    showCodeCard(true);
    updateConnectionStatus();
    startHeartbeat();  // ← jetzt definiert

    if (autoReconnectPending && partnerCode && !conn) {
      console.log(`🔄 autoReconnectPending für ${partnerCode} – starte peer.connect`);
      autoReconnectPending = false;
      const newConn = peer.connect(partnerCode, { reliable: true, metadata: { name: myName } });
      console.log('📡 peer.connect (auto) aufgerufen, newConn:', newConn);
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
      console.log('⚠️ Partner nicht erreichbar – bleibt im Lokal‑Modus');
      if (outgoingCallTimer) {
        clearTimeout(outgoingCallTimer);
        outgoingCallTimer = null;
      }
      // Kein Toast, um den Nutzer nicht zu nerven – Lokal‑Modus reicht
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
    console.log(`📥 Eingehende Verbindung von ${incoming.peer}`);
    if (conn && conn.open) {
      console.log('⚠️ Bestehende Verbindung offen, lehne neue ab');
      incoming.close();
      return;
    }
    partnerCode = incoming.peer;
    partnerName = localName(incoming.peer, incoming.metadata?.name);
    chatId = buildCID(myCode, partnerCode);
    loadPendingMessages();
    migratePendingMessages(chatId);

    console.log('💬 Öffne Chat für eingehende Verbindung (Online)');
    openChat(incoming);

    if (document.hidden) {
      pushNotif(partnerName, 'möchte mit dir chatten');
      inAppNotif(partnerName, 'Eingehender Chat');
      playRingingTone();
      triggerHaptic();
    }

    incoming.on('close', () => {
      console.log(`🔌 Eingehende Verbindung von ${partnerCode} geschlossen`);
      conn = null;
      updateConnectionStatus();
    });
  });
}

// 🆕 Heartbeat-Funktion (fehlte)
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
  console.log(`🚪 openChat aufgerufen, c=${c ? 'DataConnection' : 'null (Lokal)'}`);

  if (conn && conn !== c) {
    console.log('🔄 Schließe alte Verbindung');
    try { conn.close(); } catch (e) {}
  }
  conn = c;

  const chatActive = document.getElementById('s-chat').classList.contains('active');
  console.log(`📱 Chat bereits aktiv? ${chatActive}`);

  if (!chatActive) {
    prepChat();
    showScreen('s-chat');
  }

  // Lokaler Modus
  if (!c) {
    console.log('📴 Setze UI auf Lokal‑Modus');
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

  // Online‑Modus
  const onOpen = () => {
    console.log('🎉 DataConnection ist offen – wechsle in Online‑Modus');
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
      console.log(`👋 Sende Willkommensnachricht an ${partnerCode}`);
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
    console.log('⚡ conn.open bereits true, rufe onOpen direkt auf');
    onOpen();
  } else {
    console.log('⏳ Warte auf conn.on("open")');
    conn.on('open', onOpen);
  }

  conn.on('data', d => handleData(d));

  conn.on('close', () => {
    console.log(`🔌 DataConnection zu ${partnerCode} geschlossen`);
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
