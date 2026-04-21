'use strict';

console.log('✅ ui-home.js v6.2 geladen – Communication Hub (Gruppiert pro Kontakt)');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// Communication Hub – Nachrichten gruppiert pro Kontakt
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// DIGIT INPUT FELDER
// ══════════════════════════════════════════════════════════════════════════════

function initDigits() {
  const inps = document.querySelectorAll('.dinp-new');
  inps.forEach((p, i) => {
    p.addEventListener('input', () => {
      const v = p.value.replace(/\D/g, '');
      p.value = v ? v.slice(-1) : '';
      p.classList.toggle('filled', !!p.value);
      if (p.value && i < 5) inps[i + 1].focus();
      document.getElementById('cbtn').disabled = getDigits().length !== 6;
    });
    p.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !p.value && i > 0) {
        inps[i - 1].value = '';
        inps[i - 1].classList.remove('filled');
        inps[i - 1].focus();
        document.getElementById('cbtn').disabled = true;
      }
    });
    p.addEventListener('paste', e => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      txt.split('').forEach((ch, j) => {
        if (inps[i + j]) {
          inps[i + j].value = ch;
          inps[i + j].classList.add('filled');
        }
      });
      inps[Math.min(i + txt.length, 5)].focus();
      document.getElementById('cbtn').disabled = getDigits().length !== 6;
    });
  });
}

function getDigits() {
  return [...document.querySelectorAll('.dinp-new')].map(x => x.value).join('');
}

function copyCode() {
  navigator.clipboard.writeText(myCode).then(() => toast('✅ Code kopiert')).catch(() => toast('Code: ' + myCode));
}

async function shareCode() {
  const url = `${window.location.origin}${window.location.pathname}?code=${myCode}`;
  const text = `Mein SpotMe-Code: ${formatCode(myCode)} – chatte mit mir!`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'SpotMe', text, url });
    } catch (e) {}
  } else {
    copyCode();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED HUB – GRUPPIERT PRO KONTAKT (CHAT + SPOT)
// ══════════════════════════════════════════════════════════════════════════════

async function renderUnifiedHub() {
  const container = document.getElementById('hub-list');
  if (!container) return;

  // Alle Datenquellen sammeln
  const chats = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  const missed = getMissed();
  const spotMsgs = getSpotMessages();
  
  let serverOfflineMsgs = [];
  if (myToken) {
    try {
      const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
      if (res.ok) serverOfflineMsgs = await res.json();
    } catch (e) {}
  }

  // Alle Einträge in ein einheitliches Format bringen
  const items = [];

  // 1. Chat-Nachrichten
  chats.forEach(c => {
    items.push({
      type: 'chat',
      code: c.code,
      name: c.partner || getContacts()[c.code] || formatCode(c.code),
      preview: c.preview || '—',
      ts: c.ts,
      chatId: c.id || buildCID(myCode, c.code),
      hasMissed: missed.some(m => m.code === c.code)
    });
  });

  // 2. Verpasste Anrufe (ohne bestehenden Chat)
  missed.forEach(m => {
    if (!chats.some(c => c.code === m.code)) {
      items.push({
        type: 'missed',
        code: m.code,
        name: m.name || formatCode(m.code),
        preview: m.message || 'Verpasster Anruf',
        ts: m.ts,
        message: m.message
      });
    }
  });

  // 3. Server-Offline-Nachrichten
  serverOfflineMsgs.filter(m => !m.read).forEach(m => {
    items.push({
      type: 'offline',
      code: m.senderCode,
      name: m.senderName || formatCode(m.senderCode),
      preview: m.message,
      ts: new Date(m.timestamp).getTime(),
      messageId: m.id
    });
  });

  // 4. Spot-Kurznachrichten
  spotMsgs.filter(m => !m.read).forEach(m => {
    items.push({
      type: 'spot',
      code: m.code,
      name: m.name || formatCode(m.code),
      preview: m.message,
      ts: m.ts,
      spotType: m.spotType || 'SPOT'
    });
  });

  // Nach Kontakt gruppieren
  const grouped = {};
  items.forEach(item => {
    if (!grouped[item.code]) {
      grouped[item.code] = {
        code: item.code,
        name: item.name,
        chat: null,
        spot: null,
        missed: null,
        offline: null,
        latestTs: 0
      };
    }
    
    const contact = grouped[item.code];
    if (item.ts > contact.latestTs) contact.latestTs = item.ts;
    
    if (item.type === 'chat') contact.chat = item;
    else if (item.type === 'spot') contact.spot = item;
    else if (item.type === 'missed') contact.missed = item;
    else if (item.type === 'offline') contact.offline = item;
  });

  // In Array umwandeln und nach Zeit sortieren
  const contacts = Object.values(grouped).sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0));

  if (contacts.length === 0) {
    container.innerHTML = '<div class="empty-state">✨ Noch keine Nachrichten</div>';
    return;
  }

  // Rendern
  container.innerHTML = contacts.map(contact => {
    const alias = esc(contact.name);
    const initial = alias[0]?.toUpperCase() || '?';
    
    // CHAT-Zeile rendern
    let chatRow = '';
    if (contact.chat) {
      const c = contact.chat;
      const timeStr = formatRelativeTime(c.ts);
      const btnText = c.hasMissed ? '📞 Zurückrufen' : '💬 Chat';
      chatRow = `
        <div class="contact-row">
          <div class="row-tag tag-chat">💬 CHAT</div>
          <div class="row-content">
            <div class="row-preview">${esc(c.preview)}</div>
            <div class="row-meta">
              <span class="row-time">${timeStr}</span>
              <button class="row-btn btn-primary" onclick="openChatUnified('${c.code}', '${esc2(alias)}', '${c.chatId}', ${c.hasMissed}, 'chat')">${btnText}</button>
            </div>
          </div>
        </div>
      `;
    } else if (contact.missed) {
      const m = contact.missed;
      const timeStr = formatRelativeTime(m.ts);
      chatRow = `
        <div class="contact-row">
          <div class="row-tag tag-missed">📵 ANRUF</div>
          <div class="row-content">
            <div class="row-preview">${esc(m.preview)}</div>
            <div class="row-meta">
              <span class="row-time">${timeStr}</span>
              <button class="row-btn btn-missed" onclick="openChatUnified('${m.code}', '${esc2(alias)}', '${buildCID(myCode, m.code)}', true, 'missed')">📞 Zurückrufen</button>
            </div>
          </div>
        </div>
      `;
    } else if (contact.offline) {
      const o = contact.offline;
      const timeStr = formatRelativeTime(o.ts);
      chatRow = `
        <div class="contact-row">
          <div class="row-tag tag-offline">📴 OFFLINE</div>
          <div class="row-content">
            <div class="row-preview">${esc(o.preview)}</div>
            <div class="row-meta">
              <span class="row-time">${timeStr}</span>
              <button class="row-btn btn-primary" onclick="openChatUnified('${o.code}', '${esc2(alias)}', '${buildCID(myCode, o.code)}', false, 'offline')">💬 Chat</button>
            </div>
          </div>
        </div>
      `;
    }

    // SPOT-Zeile rendern (falls vorhanden)
    let spotRow = '';
    if (contact.spot) {
      const s = contact.spot;
      const timeStr = formatRelativeTime(s.ts);
      spotRow = `
        <div class="contact-row">
          <div class="row-tag tag-spot">📟 SPOT</div>
          <div class="row-content">
            <div class="row-preview">${esc(s.preview)}</div>
            <div class="row-meta">
              <span class="row-time">${timeStr}</span>
              <button class="row-btn btn-primary" onclick="answerSpotMessage('${s.code}', '${esc2(alias)}')">💬 Antworten</button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="contact-card">
        <div class="contact-header">
          <div class="card-avatar" style="background:linear-gradient(135deg, var(--p2), var(--p3));">${initial}</div>
          <div class="contact-info">
            <span class="contact-name">${alias}</span>
            <span class="contact-code">${formatCode(contact.code)}</span>
          </div>
        </div>
        <div class="contact-rows">
          ${chatRow}
          ${spotRow}
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// SPOT-NACHRICHTEN – ANTWORTEN (LOKAL-MODUS)
// ══════════════════════════════════════════════════════════════════════════════

function answerSpotMessage(code, name) {
  console.log('📟 answerSpotMessage →', code, name);
  
  isOffline = true;
  window.isOffline = true;
  setSpill('offline', '○ LOCAL');
  updateConnectionStatus();
  
  partnerCode = code;
  partnerName = name;
  const chatId = buildCID(myCode, code);
  window.chatId = chatId;
  chatId = chatId;
  
  loadPendingMessages();
  migratePendingMessages(chatId);
  
  if (typeof openApiChat === 'function') {
    openApiChat();
    toast(`📝 Lokale Antwort an ${name}`);
  } else {
    toast('⚠️ Fehler beim Öffnen des Chats');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// KURZNACHRICHTEN (SPOT) – HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════════════════════

function markSpotMessagesRead(code) {
  const msgs = getSpotMessages();
  const updated = msgs.filter(m => m.code !== code);
  saveSpotMessages(updated);
  renderUnifiedHub();
}

function clearSpotMessages() {
  saveSpotMessages([]);
  renderUnifiedHub();
  toast('✓ Alle Spot-Nachrichten als gelesen markiert');
}

// ══════════════════════════════════════════════════════════════════════════════
// EINHEITLICHE CHAT-ÖFFNEN FUNKTION
// ══════════════════════════════════════════════════════════════════════════════

function openChatUnified(code, name, chatId, isCallback = false, source = 'chat') {
  console.log('💬 openChatUnified →', code, name, chatId, 'source:', source);

  if (code === myCode) {
    toast('⚠️ Du kannst nicht mit dir selbst chatten');
    return;
  }

  if (!chatId || chatId === 'undefined') {
    chatId = buildCID(myCode, code);
  }

  window.chatSource = source;

  const reallyOnline = window.isServerOnline !== false && navigator.onLine;
  isOffline = !reallyOnline;
  window.isOffline = !reallyOnline;

  partnerCode = code;
  partnerName = name;
  window.chatId = chatId;
  chatId = chatId;

  loadPendingMessages();
  migratePendingMessages(chatId);

  if (typeof showCallModal === 'function') {
    showCallModal(reallyOnline ? '📞 Verbinde...' : '📝 Lokaler Modus', `${name} (${formatCode(code)})`);
  }

  if (typeof openApiChat === 'function') {
    openApiChat();
  } else {
    toast('⚠️ Fehler beim Öffnen des Chats');
    return;
  }

  setTimeout(() => {
    const reallyOnline = window.isServerOnline !== false && navigator.onLine;
    isOffline = !reallyOnline;
    window.isOffline = !reallyOnline;
    setSpill(reallyOnline ? 'online' : 'offline', reallyOnline ? '● ONLINE' : '○ LOCAL');
    updateConnectionStatus();

    const pav = document.getElementById('pav');
    if (pav) pav.className = reallyOnline ? 'pav' : 'pav offline';
    const pstatus = document.getElementById('pstatus');
    if (pstatus) pstatus.textContent = reallyOnline ? '● ONLINE' : '○ LOCAL';
  }, 50);

  if (myToken && reallyOnline) {
    sendChatRequest(code);
  }

  toast(reallyOnline ? `📞 Rufe ${name} an...` : `📝 Lokaler Chat mit ${name}...`);
}

async function sendChatRequest(recipient) {
  try {
    await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        senderCode: myCode,
        senderName: myName,
        message: '__CHAT_REQUEST__',
        type: 'chat_request'
      })
    });
    console.log('✅ Chat-Request gesendet an', recipient);
  } catch (e) {
    console.warn('⚠️ Chat-Request fehlgeschlagen:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELFER
// ══════════════════════════════════════════════════════════════════════════════

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Jetzt';
  if (mins < 60) return `vor ${mins} Min`;
  if (hours < 24) return `vor ${hours} Std`;
  if (days < 7) return `vor ${days} T`;

  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function renameContact(code, networkName) {
  const current = getContacts()[code] || '';
  const input = prompt(`Spitzname für ${networkName || formatCode(code)}:\n(leer lassen zum Zurücksetzen)`, current);
  if (input === null) return;
  const trimmed = input.trim();
  setAlias(code, trimmed);
  renderUnifiedHub();
  toast(trimmed ? `✅ "${trimmed}" gespeichert` : '○ Spitzname entfernt');
}

// ══════════════════════════════════════════════════════════════════════════════
// KOMPATIBILITÄT
// ══════════════════════════════════════════════════════════════════════════════

function renderPrev() { renderUnifiedHub(); }
function renderMissed() {}
function renderUnifiedActivity() { renderUnifiedHub(); }
function renderOfflineMessages() {}
function renderSpotMessages() {}

function reconnectTo(code, name, cid) { openChatUnified(code, name, cid, false, 'reconnect'); }
function callBack(code) { openChatUnified(code, getContacts()[code] || formatCode(code), buildCID(myCode, code), true, 'callback'); }
function clearMissed() { saveMissed([]); renderUnifiedHub(); }

function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;

  const name = localName(code);
  openChatUnified(code, name, buildCID(myCode, code), false, 'connect');

  document.querySelectorAll('.dinp-new').forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
  document.getElementById('cbtn').disabled = true;
}

// Exports
window.connectToPeer = connectToPeer;
window.openChatUnified = openChatUnified;
window.renderUnifiedHub = renderUnifiedHub;
window.clearSpotMessages = clearSpotMessages;
window.markSpotMessagesRead = markSpotMessagesRead;
window.answerSpotMessage = answerSpotMessage;
