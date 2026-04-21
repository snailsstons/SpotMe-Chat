'use strict';

console.log('✅ storage.js v2.3 geladen – API Pending-Flush + AutoFlush + Spot-Messages + Sofort-Render');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – STORAGE (storage.js)
// localStorage-Wrapper für Kontakte, Missed Calls, Pending Messages, Chat-Verlauf
// + AutoFlush für Pending-Nachrichten
// + Spot-Kurznachrichten (separat vom Chat)
// + Sofort-Render nach addSpotMessage
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

// 🆕 API-Version von flushPendingMessages
async function flushPendingMessages(silent = false) {
  if (!partnerCode || !chatId) {
    console.warn('⚠️ flushPendingMessages: Kein partnerCode/chatId');
    if (!silent) toast('⚠️ Kein aktiver Chat');
    return;
  }

  if (pendingMessages.length === 0) {
    console.log('📭 Keine Pending-Nachrichten');
    if (!silent) toast('📭 Keine gespeicherten Nachrichten');
    return;
  }

  console.log('📤 Sende', pendingMessages.length, 'Pending-Nachrichten...');
  if (!silent) toast(`📤 Sende ${pendingMessages.length} Nachricht(en)...`);

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
        pendingMessages.push(msg);
        savePendingMessages();
      }
    } catch (e) {
      console.warn('❌ Netzwerkfehler:', e);
      pendingMessages.push(msg);
      savePendingMessages();
    }
  }

  updatePendingBadge();

  if (sentCount > 0) {
    toast(`✅ ${sentCount} Nachricht(en) gesendet`);
  }

  if (pendingMessages.length > 0) {
    toast(`📦 ${pendingMessages.length} verbleiben in Warteschlange`);
  }

  return sentCount;
}

// 🆕 Automatisches Senden im Hintergrund (alle 30 Sekunden)
let autoFlushInterval = null;

function startPendingAutoFlush() {
  if (autoFlushInterval) clearInterval(autoFlushInterval);

  autoFlushInterval = setInterval(async () => {
    if (!navigator.onLine || !myToken) return;

    const keys = Object.keys(localStorage).filter(k => k.startsWith('sm_pending_'));
    if (keys.length === 0) return;

    let totalSent = 0;

    for (let key of keys) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;

      try {
        const msgs = JSON.parse(stored);
        if (msgs.length === 0) {
          localStorage.removeItem(key);
          continue;
        }

        const chatIdFromKey = key.replace('sm_pending_', '');
        const parts = chatIdFromKey.split('_');
        const partner = parts.find(p => p !== myCode);
        if (!partner) continue;

        console.log(`🔄 AutoFlush: ${msgs.length} Nachricht(en) an ${partner}`);

        const remaining = [];

        for (let msg of msgs) {
          try {
            const res = await fetch(API_BASE + '/offline-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: partner,
                senderCode: myCode,
                senderName: myName,
                message: msg.text
              })
            });

            if (res.ok) {
              totalSent++;
            } else {
              remaining.push(msg);
            }
          } catch (e) {
            remaining.push(msg);
          }
        }

        if (remaining.length === 0) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(remaining));
        }
      } catch (e) {}
    }

    if (totalSent > 0) {
      console.log(`✅ AutoFlush: ${totalSent} Nachricht(en) gesendet`);
      if (typeof updatePendingBadge === 'function') updatePendingBadge();
    }
  }, 30000);

  console.log('🔄 Pending AutoFlush gestartet (30s Intervall)');
}

function stopPendingAutoFlush() {
  if (autoFlushInterval) {
    clearInterval(autoFlushInterval);
    autoFlushInterval = null;
    console.log('⏹️ Pending AutoFlush gestoppt');
  }
}

// 🆕 Manueller Flush für Test-Button
async function manualFlushAll() {
  if (!myToken) {
    toast('⚠️ Profil nicht veröffentlicht');
    return;
  }

  const keys = Object.keys(localStorage).filter(k => k.startsWith('sm_pending_'));
  if (keys.length === 0) {
    toast('📭 Keine gespeicherten Nachrichten');
    return;
  }

  toast('📤 Sende alle gespeicherten Nachrichten...');

  let totalSent = 0;

  for (let key of keys) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;

    try {
      const msgs = JSON.parse(stored);
      if (msgs.length === 0) {
        localStorage.removeItem(key);
        continue;
      }

      const chatIdFromKey = key.replace('sm_pending_', '');
      const parts = chatIdFromKey.split('_');
      const partner = parts.find(p => p !== myCode);
      if (!partner) continue;

      const remaining = [];

      for (let msg of msgs) {
        try {
          const res = await fetch(API_BASE + '/offline-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: partner,
              senderCode: myCode,
              senderName: myName,
              message: msg.text
            })
          });

          if (res.ok) {
            totalSent++;
          } else {
            remaining.push(msg);
          }
        } catch (e) {
          remaining.push(msg);
        }
      }

      if (remaining.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(remaining));
      }
    } catch (e) {}
  }

  if (typeof updatePendingBadge === 'function') updatePendingBadge();

  if (totalSent > 0) {
    toast(`✅ ${totalSent} Nachricht(en) gesendet`);
  } else {
    toast('❌ Keine Nachrichten gesendet');
  }

  return totalSent;
}

function updatePendingBadge() {
  const btn = document.getElementById('sbtn');
  if (!btn) return;

  let totalCount = 0;
  const keys = Object.keys(localStorage).filter(k => k.startsWith('sm_pending_'));
  for (let key of keys) {
    try {
      const msgs = JSON.parse(localStorage.getItem(key) || '[]');
      totalCount += msgs.length;
    } catch (e) {}
  }

  if (totalCount > 0) {
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
      badge.style.zIndex = '10';
      btn.appendChild(badge);
    }
    badge.textContent = totalCount > 99 ? '99+' : totalCount;
    badge.style.display = 'block';
  } else {
    const badge = document.getElementById('pending-badge');
    if (badge) badge.style.display = 'none';
  }
}

function buildCID(a, b) {
  return 'sm_' + [a, b].sort().join('_');
}

// ══════════════════════════════════════════════════════════════════════════════
// KURZNACHRICHTEN (SPOT) – SEPARAT VOM CHAT
// ══════════════════════════════════════════════════════════════════════════════

function getSpotMessages() {
  return JSON.parse(localStorage.getItem('sm_spot_messages') || '[]');
}

function saveSpotMessages(msgs) {
  localStorage.setItem('sm_spot_messages', JSON.stringify(msgs));
}

function addSpotMessage(senderCode, senderName, message, spotType = 'SPOT', ts = Date.now()) {
  const msgs = getSpotMessages();
  msgs.push({
    code: senderCode,
    name: senderName,
    message: message,
    spotType: spotType,
    ts: ts,
    read: false
  });
  saveSpotMessages(msgs);
  
  // 🆕 Hub SOFORT aktualisieren, wenn auf Home-Screen!
  if (document.getElementById('s-home')?.classList.contains('active')) {
    if (typeof renderUnifiedHub === 'function') {
      setTimeout(() => renderUnifiedHub(), 50); // Kleine Verzögerung für DOM
    }
  }
  
  console.log('📟 Spot-Nachricht gespeichert:', senderCode, message);
}

function getUnreadSpotCount(code) {
  const msgs = getSpotMessages();
  return msgs.filter(m => m.code === code && !m.read).length;
}

function markSpotMessageRead(code, ts) {
  const msgs = getSpotMessages();
  const updated = msgs.map(m => {
    if (m.code === code && m.ts === ts) {
      return { ...m, read: true };
    }
    return m;
  });
  saveSpotMessages(updated);
}

function markAllSpotMessagesRead(code) {
  const msgs = getSpotMessages();
  const updated = msgs.filter(m => m.code !== code);
  saveSpotMessages(updated);
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBALE EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

window.flushPendingMessages = flushPendingMessages;
window.startPendingAutoFlush = startPendingAutoFlush;
window.stopPendingAutoFlush = stopPendingAutoFlush;
window.manualFlushAll = manualFlushAll;

window.getSpotMessages = getSpotMessages;
window.saveSpotMessages = saveSpotMessages;
window.addSpotMessage = addSpotMessage;
window.getUnreadSpotCount = getUnreadSpotCount;
window.markSpotMessageRead = markSpotMessageRead;
window.markAllSpotMessagesRead = markAllSpotMessagesRead;
