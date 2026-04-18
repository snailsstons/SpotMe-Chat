'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGSAUFBAU (p2p-call.js)
// + Verpasste Anrufe mit Nachricht
// ══════════════════════════════════════════════════════════════════════════════

let isConnecting = false;

function connectToPeer() {
  if (isConnecting) { console.warn('⚠️ bereits aktiv'); return; }
  isConnecting = true;

  console.log('📞 connectToPeer, peerReady:', peerReady, 'peer:', peer);
  const code = getDigits();
  if (code.length !== 6 || code === myCode) { isConnecting = false; return; }

  const btn = document.getElementById('cbtn');
  if (btn) btn.disabled = true;

  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);

  if (conn) { try { conn.close(); } catch (e) {} conn = null; }

  if (peerReady && peer) {
    console.log('🔄 starte peer.connect zu', code);
    try {
      const newConn = peer.connect(code, { reliable: true, metadata: { name: myName } });
      console.log('newConn:', newConn);
      if (newConn) {
        console.log('✅ öffne Online-Chat');
        if (typeof openChat === 'function') {
          openChat(newConn);
        } else {
          console.error('❌ openChat ist keine Funktion! Fallback Lokalmodus');
          openChatFallback();
        }
      } else {
        console.warn('❌ newConn ist null – fallback Lokalmodus');
        openChatFallback();
      }
    } catch (e) {
      console.error('❌ peer.connect Exception:', e);
      openChatFallback();
    }
  } else {
    console.log('⏳ Peer nicht bereit – Lokalmodus');
    openChatFallback();
  }

  setTimeout(() => { if (btn) btn.disabled = false; isConnecting = false; }, 3000);
}

function openChatFallback() {
  console.log('📴 Fallback: Lokalmodus');
  if (typeof openChat === 'function') {
    openChat(null);
  } else {
    // Notfall: UI manuell auf Lokalmodus setzen
    if (typeof prepChat === 'function') prepChat();
    showScreen('s-chat');
    document.getElementById('sbtn').disabled = false;
    document.getElementById('rcbar').classList.remove('show');
    if (typeof refreshStatusText === 'function') refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    const h = document.getElementById('ehint');
    if (h) h.innerHTML = `<div class="empty-icon">📴</div><div class="empty-txt">Lokaler Modus</div>`;
    if (typeof updateIdx === 'function') updateIdx('');
  }
  setSpill('offline', '○ LOCAL');
  updateConnectionStatus();
  if (typeof markAutoReconnect === 'function') markAutoReconnect();
}

function acceptCall() {
  console.log('✅ acceptCall called');
  stopRingingTone();
  if (!pendingConn) return;
  const c = pendingConn; pendingConn = null;
  partnerCode = c.peer; partnerName = localName(c.peer, c.metadata?.name);
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages(); migratePendingMessages(chatId);
  openChat(c);
}

function declineCall() {
  console.log('❌ declineCall called');
  stopRingingTone();
  if (pendingConn) {
    const c = pendingConn; pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try { c.close(); } catch (e) {}
  }
  showScreen('s-home');
}

// 🆕 Hilfsfunktion, die addMissed mit message aufruft
function addMissedWithMessage(code, name, outgoing, message) {
  const arr = getMissed();
  const recent = arr.findIndex(m => m.code === code && Date.now() - m.ts < 60000);
  const entry = { code, name, ts: Date.now(), message };
  if (recent >= 0) arr[recent] = entry;
  else arr.unshift(entry);
  saveMissed(arr.slice(0, 30));
  renderMissed();
  // Server-Sync wie gehabt (ohne message, da API das nicht unterstützt)
  try {
    const payload = outgoing
      ? { recipient: code, callerId: myCode, callerName: myName }
      : { recipient: myCode, callerId: code, callerName: name };
    fetch(API_MISSED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

async function submitLeaveMessage() {
  const input = document.getElementById('leave-message-input');
  const text = input.value.trim();
  if (!text) { toast('Bitte eine Nachricht eingeben'); return; }
  const btn = document.getElementById('leave-msg-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Senden...'; }
  try {
    const payload = {
      recipient: partnerCode,
      senderCode: myCode,
      senderName: myName,
      message: text
    };
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      toast(`📨 Nachricht an ${partnerName} gesendet`);
      // 🆕 Nachricht auch im verpassten Anruf speichern
      addMissedWithMessage(partnerCode, partnerName, true, text);
    } else if (res.status === 429) {
      toast('⏳ ' + (data.error || 'Bitte warte etwas'));
    } else {
      toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
    }
  } catch (e) {
    toast('⚠️ Keine Verbindung zum Server');
    // Auch bei Offline-Fehler lokal speichern
    addMissedWithMessage(partnerCode, partnerName, true, text);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Senden'; }
  }
  closeLeaveMessageSheet();
  showScreen('s-home');
  updateConnectionStatus();
}

function showLeaveMessageSheet(code, name) {
  partnerCode = code;
  partnerName = name;
  document.getElementById('leave-message-input').value = '';
  document.getElementById('leave-message-ovl').classList.add('open');
  document.getElementById('leave-message-sheet').classList.add('open');
  setTimeout(() => document.getElementById('leave-message-input').focus(), 100);
}

function closeLeaveMessageSheet() {
  document.getElementById('leave-message-ovl').classList.remove('open');
  document.getElementById('leave-message-sheet').classList.remove('open');
  showScreen('s-home');
  updateConnectionStatus();
}

// Explizit global verfügbar machen (für onclick-Handler)
window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.connectToPeer = connectToPeer;
window.submitLeaveMessage = submitLeaveMessage;
window.closeLeaveMessageSheet = closeLeaveMessageSheet;
window.showLeaveMessageSheet = showLeaveMessageSheet;
