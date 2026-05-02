'use strict';

console.log('✅ spot-kurznachricht.js v2.2 geladen – mit globalem Token');

// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KURZNACHRICHT (spot-kurznachricht.js)
// + Globaler Token für alle Spots
// ══════════════════════════════════════════════════════════════════════════════

let _kurznachrichtTarget = null;

function getPendingMsgKey() {
  return `spot_pending_msg_${SPOT}`;
}

function loadPendingMessages() {
  const key = getPendingMsgKey();
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

function savePendingMessages(msgs) {
  const key = getPendingMsgKey();
  if (msgs.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(msgs));
}

function addPendingMessage(recipient, text, senderName) {
  const msgs = loadPendingMessages();
  msgs.push({
    recipient,
    senderCode: myCode,
    senderName,
    message: text,
    ts: Date.now(),
    type: 'spot_message',
    source: 'spot',
    spotType: SPOT || 'SPOT'
  });
  savePendingMessages(msgs);
  console.log('📦 Pending gespeichert:', msgs.length, 'in Warteschlange');
}

async function flushPendingKurznachrichten() {
  const msgs = loadPendingMessages();
  if (msgs.length === 0) return;

  console.log('📤 Flushe', msgs.length, 'Pending-Nachrichten...');
  
  const token = localStorage.getItem('sm_token');
  
  let successCount = 0;
  for (const msg of msgs) {
    try {
      const res = await fetch(API + '/offline-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...msg, token })
      });
      if (res.ok) successCount++;
    } catch (e) {
      console.warn('❌ Pending-Fehler:', e.message);
    }
  }

  if (successCount > 0) {
    toast(`📨 ${successCount} gespeicherte Kurznachricht(en) gesendet`);
    if (typeof Usage !== 'undefined') {
      for (let i = 0; i < successCount; i++) Usage.incrementMessagesSent();
    }
  }
  savePendingMessages([]);
}

function showKurznachrichtModal(code, name) {
  const token = localStorage.getItem('sm_token');
  if (!token) {
    toast('⚠️ Bitte zuerst dein Profil veröffentlichen');
    return;
  }
  
  console.log('📟 Modal öffnen für:', code, name);
  _kurznachrichtTarget = { code, name };
  document.getElementById('kurznachr-name').textContent = name;
  document.getElementById('kurznachr-input').value = '';
  document.getElementById('kurznachr-chars').textContent = '280';
  document.getElementById('kurznachricht-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('kurznachr-input').focus(), 100);
}

function closeKurznachrichtModal() {
  const modal = document.getElementById('kurznachricht-modal');
  if (modal) modal.style.display = 'none';
  _kurznachrichtTarget = null;
}

async function submitKurznachricht() {
  console.log('📟 submitKurznachricht aufgerufen');
  
  if (!_kurznachrichtTarget) {
    console.warn('⚠️ Kein Ziel!');
    return;
  }
  
  const text = document.getElementById('kurznachr-input').value.trim();
  if (!text) { 
    toast('⚠️ Bitte eine Nachricht eingeben'); 
    return; 
  }

  const token = localStorage.getItem('sm_token');
  
  if (!token) {
    toast('⚠️ Kein Token – bitte Profil veröffentlichen');
    return;
  }

  const btn = document.getElementById('kurznachr-btn');
  const senderName = myProfile?.name || localStorage.getItem('sm_name') || myCode;

  console.log('📟 Ziel:', _kurznachrichtTarget.code, _kurznachrichtTarget.name);
  console.log('📟 Text:', text);
  console.log('📟 SPOT:', SPOT);
  console.log('📟 Token:', token ? 'vorhanden' : 'FEHLT!');

  const online = navigator.onLine;
  console.log('📟 Online?', online);

  if (!online) {
    addPendingMessage(_kurznachrichtTarget.code, text, senderName);
    toast(`📦 Nachricht gespeichert (wird später gesendet)`);
    closeKurznachrichtModal();
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Senden...';
  
  try {
    const payload = {
      recipient: _kurznachrichtTarget.code,
      senderCode: myCode,
      senderName: senderName,
      message: text,
      type: 'spot_message',
      source: 'spot',
      spotType: SPOT || 'SPOT',
      token: token
    };
    
    console.log('📤 Sende Payload:', payload);
    console.log('📤 API-URL:', API + '/offline-message');
    
    const res = await fetch(API + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log('📥 Server-Status:', res.status);
    
    const data = await res.json();
    console.log('📥 Server-Antwort:', data);
    
    if (res.ok) {
      toast(`📨 Nachricht an ${_kurznachrichtTarget.name} gesendet`);
      closeKurznachrichtModal();
      if (typeof Usage !== 'undefined') {
        Usage.incrementMessagesSent();
      }
    } else {
      toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
    }
  } catch (e) {
    console.error('❌ Sende-Fehler:', e.message);
    addPendingMessage(_kurznachrichtTarget.code, text, senderName);
    toast(`📦 Nachricht gespeichert (wird später gesendet)`);
    closeKurznachrichtModal();
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 Senden';
  }
}

// Debug
console.log('📟 spot-kurznachricht.js geladen');
console.log('📟 SPOT:', typeof SPOT !== 'undefined' ? SPOT : 'NICHT DEFINIERT!');
console.log('📟 API:', typeof API !== 'undefined' ? API : 'NICHT DEFINIERT!');
console.log('📟 myCode:', typeof myCode !== 'undefined' ? myCode : 'NICHT DEFINIERT!');
