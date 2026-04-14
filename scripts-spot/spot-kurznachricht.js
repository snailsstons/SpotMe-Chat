'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KURZNACHRICHT (spot-kurznachricht.js)
// + Local‑First: Offline‑Nachrichten werden gespeichert und später gesendet
// + Debug‑Logs für Fehlersuche
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
    ts: Date.now()
  });
  savePendingMessages(msgs);
}

async function flushPendingKurznachrichten() {
  const msgs = loadPendingMessages();
  if (msgs.length === 0) return;

  let successCount = 0;
  for (const msg of msgs) {
    try {
      const res = await fetch(API + '/offline-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      });
      if (res.ok) successCount++;
    } catch (e) {}
  }

  if (successCount > 0) {
    toast(`📨 ${successCount} gespeicherte Kurznachricht(en) gesendet`);
  }
  savePendingMessages([]);
}

function showKurznachrichtModal(code, name) {
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
  if (!_kurznachrichtTarget) return;
  const text = document.getElementById('kurznachr-input').value.trim();
  if (!text) { toast('⚠️ Bitte eine Nachricht eingeben'); return; }

  const btn = document.getElementById('kurznachr-btn');
  const senderName = myProfile?.name || myCode;

  const online = (typeof peerReady !== 'undefined' && peerReady) || navigator.onLine;

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
      spot: SPOT            // optional, aber hilfreich
    };
    console.log('Sending offline-message payload:', payload);
    const res = await fetch(API + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('Server response:', res.status, data);
    if (res.ok) {
      toast(`📨 Nachricht an ${_kurznachrichtTarget.name} gesendet`);
      closeKurznachrichtModal();
    } else {
      toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
    }
  } catch (e) {
    console.warn('Fetch error:', e);
    addPendingMessage(_kurznachrichtTarget.code, text, senderName);
    toast(`📦 Nachricht gespeichert (wird später gesendet)`);
    closeKurznachrichtModal();
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 Senden';
  }
}
