'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js) – DIAGNOSE-VERSION
// + Extrem detaillierte Logs für Verbindungsprobleme
// ══════════════════════════════════════════════════════════════════════════════

let peerRetries = 0;
let heartbeatInterval = null;
let autoReconnectPending = false;
let reconnectTimer = null;

function initPeer() {
  console.log(`🚀 initPeer aufgerufen. myCode=${myCode}`);
  if (peer && !peer.destroyed && peer.open) {
    console.log('ℹ️ Peer existiert bereits und ist offen.');
    return;
  }
  if (peer && !peer.destroyed) {
    console.log('⚠️ Alte Peer-Instanz wird zerstört.');
    try { peer.destroy(); } catch (e) {}
  }
  peer = null;
  peerReady = false;
  updateConnectionStatus();

  console.log(`🆕 Erstelle neuen Peer mit ID "${myCode}"`);
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
    console.log(`✅ PeerJS open – Verbindung zum Signalisierungsserver hergestellt. Meine ID: ${peer.id}`);
    peerRetries = 0;
    isOffline = false;
    peerReady = true;
    showCodeCard(true);
    updateConnectionStatus();
    startHeartbeat();

    if (autoReconnectPending && partnerCode && !conn) {
      console.log(`🔄 autoReconnectPending für ${partnerCode} – starte peer.connect`);
      autoReconnectPending = false;
      const newConn = peer.connect(partnerCode, { reliable: true, metadata: { name: myName } });
      console.log(`📡 peer.connect (auto) aufgerufen, newConn:`, newConn);
      openChat(newConn);
    }
  });

  peer.on('error', err => {
    console.warn(`❌ [peer] error: type="${err.type}", message="${err.message}"`);
    peerReady = false;
    if (err.type === 'unavailable-id') {
      console.warn(`🆔 ID "${myCode}" ist bereits vergeben. Neuer Versuch in Kürze.`);
      peerRetries++;
      const delay = Math.min(3000 * peerRetries, 15000);
      setTimeout(() => { peer = null; initPeer(); }, delay);
      return;
    }
    if (err.type === 'peer-unavailable') {
      console.warn(`👤 Peer "${partnerCode}" ist nicht erreichbar (peer-unavailable).`);
      if (outgoingCallTimer) {
        clearTimeout(outgoingCallTimer);
        outgoingCallTimer = null;
      }
      return;
    }
    console.warn(`🌐 Allgemeiner Netzwerkfehler – wechsle in Lokal-Modus.`);
    isOffline = true;
    updateConnectionStatus();
    peerRetries++;
    const delay = Math.min(4000 * peerRetries, 20000);
    setTimeout(() => { peer = null; initPeer(); }, delay);
  });

  peer.on('disconnected', () => {
    console.warn(`🔌 [peer] disconnected – Verbindung zum Signalisierungsserver verloren.`);
    peerReady = false;
    isOffline = true;
    updateConnectionStatus();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (!peer || !peer.open) {
        console.log(`🔄 Versuche Peer neu zu initialisieren.`);
        peer = null;
        initPeer();
      }
      reconnectTimer = null;
    }, 3000);
  });

  peer.on('connection', incoming => {
    console.log(`📥 Eingehende Verbindung von ${incoming.peer} (Metadaten: ${JSON.stringify(incoming.metadata)})`);
    if (conn && conn.open) {
      console.warn(`⚠️ Bestehende Verbindung ist bereits offen. Lehne neue ab.`);
      incoming.close();
      return;
    }
    pendingConn = incoming;
    const peerName = localName(incoming.peer, incoming.metadata?.name);
    console.log(`👤 Anrufer: ${peerName} (${incoming.peer})`);
    document.getElementById('in-name').textContent = peerName;
    document.getElementById('in-code').textContent = 'Code: ' + formatCode(incoming.peer);
    showScreen('s-in');
    pushNotif(peerName, 'möchte mit dir chatten');
    inAppNotif(peerName, 'Eingehende Chatanfrage');
    playRingingTone();
    triggerHaptic();

    incoming.on('close', () => {
      console.log(`🔌 Eingehende Verbindung von ${incoming.peer} wurde geschlossen (vom Anrufer oder abgelehnt).`);
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
  console.log(`🔁 tryReconnect: partnerCode=${partnerCode}, peerReady=${peerReady}`);
  if (!partnerCode || !peerReady) return;
  document.getElementById('rcbar').classList.remove('show');
  const newConn = peer.connect(partnerCode, { reliable: true, metadata: { name: myName } });
  console.log(`📡 peer.connect (tryReconnect) aufgerufen, newConn:`, newConn);
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

  const onOpen = () => {
    console.log(`🎉 DataConnection zu ${partnerCode} ist offen – wechsle in Online‑Modus`);
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
    console.log(`🔌 DataConnection zu ${partnerCode} wurde geschlossen.`);
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
    console.warn(`❌ [conn] error:`, err);
    if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    document.getElementById('rcbar').classList.add('show');
    updateConnectionStatus();
  });
}

function markAutoReconnect() {
  console.log('🏷️ markAutoReconnect gesetzt');
  autoReconnectPending = true;
               }
