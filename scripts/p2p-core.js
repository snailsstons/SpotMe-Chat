'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – P2P CORE (p2p-core.js)
// + Detaillierte Logs für Verbindungsaufbau und Moduswechsel
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
    host: SERVER_HOST, port: 443, path: SERVER_PATH, secure: true,
    config: { iceServers: [ /* ... */ ] }
  });

  peer.on('open', () => {
    console.log('✅ PeerJS open – Verbindung zum Server hergestellt');
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
      console.log('📡 peer.connect (auto) aufgerufen, newConn:', newConn);
      openChat(newConn);
    } else {
      console.log(`ℹ️ autoReconnectPending=${autoReconnectPending}, partnerCode=${partnerCode}, conn=${conn}`);
    }
  });

  peer.on('error', err => {
    console.warn('[peer] error', err.type, err.message);
    // ... unverändert ...
  });

  peer.on('disconnected', () => {
    console.warn('[peer] disconnected');
    // ... unverändert ...
  });

  peer.on('connection', incoming => {
    console.log(`📥 Eingehende Verbindung von ${incoming.peer}`);
    // Bestehende Verbindung?
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

// startHeartbeat, tryReconnect unverändert

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
    // ... unverändert ...
  });

  conn.on('error', err => {
    console.warn('[conn] error', err);
    // ... unverändert ...
  });
}

function markAutoReconnect() {
  console.log('🏷️ markAutoReconnect gesetzt');
  autoReconnectPending = true;
      }
