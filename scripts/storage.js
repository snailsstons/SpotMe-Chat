'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – STORAGE (storage.js)
// localStorage-Wrapper für Kontakte, Missed Calls, Pending Messages, Chat-Verlauf
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Kontakte (Aliase)
function getContacts() {
  return JSON.parse(localStorage.getItem('sm_contacts') || '{}');
}

function saveContacts(c) {
  localStorage.setItem('sm_contacts', JSON.stringify(c));
}

function setAlias(code, name) {
  const c = getContacts();
  if (name) c[code] = name;
  else delete c[code];
  saveContacts(c);
}

function localName(code, fallback) {
  return getContacts()[code] || fallback || ('Nutzer_' + code.slice(0, 4));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verpasste Anrufe
function getMissed() {
  return JSON.parse(localStorage.getItem('sm_missed') || '[]');
}

function saveMissed(a) {
  localStorage.setItem('sm_missed', JSON.stringify(a));
}

async function addMissed(code, name, outgoing = false) {
  const arr = getMissed();
  const recent = arr.findIndex(m => m.code === code && Date.now() - m.ts < 60000);
  const entry = { code, name, ts: Date.now() };
  if (recent >= 0) arr[recent] = entry;
  else arr.unshift(entry);
  saveMissed(arr.slice(0, 30));
  renderMissed();

  try {
    const payload = outgoing
      ? { recipient: code, callerId: myCode, callerName: myName }
      : { recipient: myCode, callerId: code, callerName: name };
    await fetch(API_MISSED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Server missed call sync failed', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline-Nachrichten (Server-API)
async function fetchOfflineMessages() {
  if (!myToken) return [];
  try {
    const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function markOfflineMsgRead(id) {
  if (!myToken) return;
  try {
    await fetch(`${API_BASE}/offline-message/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: myCode, token: myToken })
    });
  } catch (e) {}
}

async function markAllOfflineMsgsRead() {
  if (!myToken) return;
  try {
    await fetch(`${API_BASE}/offline-messages/${myCode}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: myCode, token: myToken })
    });
  } catch (e) {}
}

async function fetchRemoteMissedCalls() {
  try {
    const res = await fetch(`https://spotme-chat.onrender.com/api/missed-calls/${myCode}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending Messages (Warteschlange für Offline-Nachrichten)
function getPendingStorageKey() {
  return chatId ? 'sm_pending_' + chatId : 'sm_pending_temp';
}

function loadPendingMessages() {
  const key = getPendingStorageKey();
  const stored = localStorage.getItem(key);
  try {
    pendingMessages = stored ? JSON.parse(stored) : [];
  } catch (e) {
    pendingMessages = [];
  }
  updatePendingBadge();
}

function savePendingMessages() {
  const key = getPendingStorageKey();
  if (pendingMessages.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(pendingMessages));
}

function addPendingMessage(text) {
  pendingMessages.push({ text, ts: Date.now() });
  savePendingMessages();
  updatePendingBadge();
}

function clearPendingMessages() {
  pendingMessages = [];
  const key = getPendingStorageKey();
  localStorage.removeItem(key);
  updatePendingBadge();
}

function migratePendingMessages(newChatId) {
  const oldKey = 'sm_pending_temp';
  const stored = localStorage.getItem(oldKey);
  if (stored) {
    try {
      const tempMsgs = JSON.parse(stored);
      if (tempMsgs.length > 0) {
        pendingMessages = tempMsgs;
        savePendingMessages();
        localStorage.removeItem(oldKey);
        updatePendingBadge();
      }
    } catch (e) {}
  }
}

function flushPendingMessages() {
  if (!conn || !conn.open) return;
  if (pendingMessages.length === 0) return;
  const toSend = [...pendingMessages];
  clearPendingMessages();
  for (let msg of toSend) {
    const m = { t: 'text', text: msg.text, ts: msg.ts };
    conn.send(m);
    appendMsg({ ...m, own: true });
    persistMsg({ ...m, own: true });
  }
  toast(`📨 ${toSend.length} ${toSend.length === 1 ? 'Nachricht' : 'Nachrichten'} gesendet`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat-Verlauf (smmsg_*) und sm_idx
function buildCID(a, b) {
  return 'sm_' + [a, b].sort().join('_');
}