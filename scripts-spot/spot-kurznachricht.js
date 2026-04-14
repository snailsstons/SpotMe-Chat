'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KURZNACHRICHT (spot-kurznachricht.js)
// + Local‑First: Offline‑Nachrichten werden gespeichert und später gesendet
// ══════════════════════════════════════════════════════════════════════════════

let _kurznachrichtTarget = null;

// Pending‑Queue für Offline‑Kurznachrichten (eigener Storage‑Key pro Spot)
const PENDING_MSG_KEY = `spot_pending_msg_${SPOT}`;

function loadPendingMessages() {
  const stored = localStorage.getItem(PENDING_MSG_KEY);
  return stored ? JSON.parse(stored) : [];
}

function savePendingMessages(msgs) {
  if (msgs.length === 0) localStorage.removeItem(PENDING_MSG_KEY);
  else localStorage.setItem(PENDING_MSG_KEY, JSON.stringify(msgs));
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

// Wird aufgerufen, sobald der Server wieder erreichbar ist (aus spot-init.js)
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

  // Prüfen, ob wir online sind (Herzstück: PeerReady aus der Haupt‑App oder navigator.onLine)
  const online = (typeof peerReady !== 'undefined' && peerReady) || navigator.onLine;

  if (!online) {
    // Offline → lokal speichern
    addPendingMessage(_kurznachrichtTarget.code, text, senderName);
    toast(`📦 Nachricht gespeichert (wird später gesendet)`);
    closeKurznachrichtModal();
    return;
  }

  // Online → direkt senden
  btn.disabled = true;
  btn.textContent = '⏳ Senden...';
  try {
    const res = await fetch(API + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: _kurznachrichtTarget.code,
        senderCode: myCode,
        senderName: senderName,
        message: text
      })
    });
    const data = await res.json();
    if (res.ok) {
      toast(`📨 Nachricht an ${_kurznachrichtTarget.name} gesendet`);
      closeKurznachrichtModal();
    } else if (res.status === 429) {
      toast('⏳ ' + (data.error || 'Bitte warte etwas'));
    } else {
      toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
    }
  } catch (e) {
    // Netzwerkfehler → ebenfalls lokal speichern
    addPendingMessage(_kurznachrichtTarget.code, text, senderName);
    toast(`📦 Nachricht gespeichert (wird später gesendet)`);
    closeKurznachrichtModal();
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 Senden';
  }
}
