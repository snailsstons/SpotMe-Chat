'use strict';

console.log('✅ storage.js v2.0 geladen – API Pending-Flush');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – STORAGE (storage.js)
// localStorage-Wrapper für Kontakte, Missed Calls, Pending Messages, Chat-Verlauf
// + Info-Modal für Bestätigungen
// ══════════════════════════════════════════════════════════════════════════════

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

function getMissed() {
  return JSON.parse(localStorage.getItem('sm_missed') || '[]');
}

function saveMissed(a) {
  localStorage.setItem('sm_missed', JSON.stringify(a));
}

async function addMissed(code, name, outgoing = false, message = '') {
  const arr = getMissed();
  const recent = arr.findIndex(m => m.code === code && Date.now() - m.ts < 60000);
  const entry = { code, name, ts: Date.now(), message };
  if (recent >= 0) arr[recent] = entry;
  else arr.unshift(entry);
  saveMissed(arr.slice(0, 30));
  if (typeof renderMissed === 'function') renderMissed();

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
  if (typeof showInfoModal === 'function') {
    showInfoModal(
      '📦 Lokal gespeichert',
      `Nachricht wird gesendet, sobald du wieder online bist.\n(${pendingMessages.length} in Warteschlange)`,
      'Verstanden'
    );
  }
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

// 🆕 NEU: API-Version von flushPendingMessages
async function flushPendingMessages() {
  if (!partnerCode || !chatId) {
    console.warn('⚠️ flushPendingMessages: Kein partnerCode/chatId');
    return;
  }
  
  if (pendingMessages.length === 0) {
    console.log('📭 Keine Pending-Nachrichten');
    return;
  }
  
  console.log('📤 Sende', pendingMessages.length, 'Pending-Nachrichten...');
  
  const toSend = [...pendingMessages];
  clearPendingMessages();
  
  let sentCount = 0;
  
  for (let msg of toSend) {
    try {
      const res = await fetch(API_BASE + '/offline-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: partnerCode,
          senderCode: myCode,
          senderName: myName,
          message: msg.text
        })
      });
      
      if (res.ok) {
        sentCount++;
        console.log('✅ Gesendet:', msg.text);
      } else {
        console.warn('❌ Fehler beim Senden:', msg.text);
        // Bei Fehler wieder in Queue legen
        pendingMessages.push(msg);
        savePendingMessages();
      }
    } catch (e) {
      console.warn('❌ Netzwerkfehler:', e);
      // Bei Fehler wieder in Queue legen
      pendingMessages.push(msg);
      savePendingMessages();
    }
  }
  
  updatePendingBadge();
  
  if (sentCount > 0) {
    toast(`✅ ${sentCount} Nachricht(en) gesendet`);
  }
  
  if (pendingMessages.length > 0) {
    toast(`📦 ${pendingMessages.length} Nachricht(en) verbleiben in Warteschlange`);
  }
}

function updatePendingBadge() {
  const btn = document.getElementById('sbtn');
  if (!btn) return;
  const count = pendingMessages.length;
  if (count > 0) {
    btn.style.position = 'relative';
    let badge = document.getElementById('pending-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'pending-badge';
      badge.style.position = 'absolute';
      badge.style.top = '-8px';
      badge.style.right = '-8px';
      badge.style.backgroundColor = 'var(--p3)';
      badge.style.color = 'white';
      badge.style.borderRadius = '12px';
      badge.style.padding = '2px 6px';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = 'bold';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'block';
  } else {
    const badge = document.getElementById('pending-badge');
    if (badge) badge.style.display = 'none';
  }
}

function buildCID(a, b) {
  return 'sm_' + [a, b].sort().join('_');
}

// Globale Exports
window.flushPendingMessages = flushPendingMessages;
