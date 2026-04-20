'use strict';

console.log('✅ ui-home.js v6.0 geladen – Communication Hub (Unified)');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// Communication Hub – Alle Nachrichten in einer vertikalen Liste mit Tags
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
// UNIFIED HUB – ALLE NACHRICHTEN IN EINER LISTE MIT TAGS
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

  // Nach Zeit sortieren (neueste zuerst)
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">✨ Noch keine Nachrichten</div>';
    return;
  }

  // Rendern
  container.innerHTML = items.map(item => {
    const alias = esc(item.name);
    const initial = alias[0]?.toUpperCase() || '?';
    const timeStr = formatRelativeTime(item.ts);
    
    // Tag bestimmen
    let tagText = '', tagClass = '';
    if (item.type === 'chat') {
      tagText = '💬 CHAT';
      tagClass = 'tag-chat';
    } else if (item.type === 'missed') {
      tagText = '📵 ANRUF';
      tagClass = 'tag-missed';
    } else if (item.type === 'offline') {
      tagText = '📴 OFFLINE';
      tagClass = 'tag-offline';
    } else if (item.type === 'spot') {
      tagText = `📟 ${item.spotType || 'SPOT'}`;
      tagClass = 'tag-spot';
    }

    // Buttons je nach Typ
    let actionsHtml = '';
    if (item.type === 'chat') {
      const btnText = item.hasMissed ? '📞 Zurückrufen' : '💬 Chat';
      actionsHtml = `<button class="card-btn btn-primary" onclick="openChatUnified('${item.code}', '${esc2(alias)}', '${item.chatId}', ${item.hasMissed}, 'chat')">${btnText}</button>`;
    } else if (item.type === 'missed') {
      actionsHtml = `
        <button class="card-btn btn-missed" onclick="openChatUnified('${item.code}', '${esc2(alias)}', '${buildCID(myCode, item.code)}', true, 'missed')">📞 Zurückrufen</button>
        <button class="card-btn btn-secondary" onclick="showLeaveMessageSheet('${item.code}', '${esc2(alias)}')">↩️ Antworten</button>
      `;
    } else if (item.type === 'offline') {
      actionsHtml = `
        <button class="card-btn btn-primary" onclick="openChatUnified('${item.code}', '${esc2(alias)}', '${buildCID(myCode, item.code)}', false, 'offline')">💬 Chat</button>
        <button class="card-btn btn-secondary" onclick="markOfflineMsgRead('${item.messageId}'); renderUnifiedHub();">✓ Gelesen</button>
      `;
    } else if (item.type === 'spot') {
      actionsHtml = `
        <button class="card-btn btn-primary" onclick="openSpotChat('${item.code}')">💬 Antworten</button>
        <button class="card-btn btn-secondary" onclick="markSpotMessagesRead('${item.code}'); renderUnifiedHub();">✓ Gelesen</button>
      `;
    }

    return `
      <div class="unified-card">
        <div class="card-header">
          <span class="card-tag ${tagClass}">${tagText}</span>
          <span class="card-time">${timeStr}</span>
        </div>
        <div style="display: flex;">
          <div class="card-avatar" style="background:linear-gradient(135deg, var(--p2), var(--p3));">${initial}</div>
          <div style="flex: 1;">
            <div class="card-contact">
              <span class="card-name">${alias}</span>
              <span class="card-code">${formatCode(item.code)}</span>
            </div>
            <div class="card-preview">${esc(item.preview)}</div>
            <div class="card-actions">
              ${actionsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// KURZNACHRICHTEN (SPOT) – HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════════════════════

function openSpotChat(code) {
  const name = getContacts()[code] || formatCode(code);
  openChatUnified(code, name, buildCID(myCode, code), false, 'spot');
  markSpotMessagesRead(code);
}

function markSpotMessagesRead(code) {
  const msgs = getSpotMessages();
  const updated = msgs.filter(m => m.code !== code);
  saveSpotMessages(updated);
  renderUnifiedHub();
}

function clearSpotMessages() {
  saveSpotMessages([]);
  renderUnifiedHub();
  toast('✓ Alle Kurznachrichten als gelesen markiert');
}

// ══════════════════════════════════════════════════════════════════════════════
// EINHEITLICHE CHAT-ÖFFNEN FUNKTION – MIT ECHTEM STATUS
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

  // ECHTEN Status vom Heartbeat verwenden
  const reallyOnline = window.isServerOnline !== false && navigator.onLine;
  isOffline = !reallyOnline;
  window.isOffline = !reallyOnline;

  console.log('🌐 Server-Status:', reallyOnline ? 'ONLINE' : 'OFFLINE');

  partnerCode = code;
  partnerName = name;
  window.chatId = chatId;
  chatId = chatId;

  console.log('✅ chatId gesetzt:', chatId);

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

    console.log('✅ Status gesetzt:', reallyOnline ? 'ONLINE' : 'LOCAL');
  }, 50);

  if (myToken && reallyOnline) {
    sendChatRequest(code);
  }

  toast(reallyOnline ? `📞 Rufe ${name} an...` : `📝 Lokaler Chat mit ${name}...`);

  console.log('⏰ Fallback-Timer DEAKTIVIERT – Status wird vom Heartbeat gesteuert');
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

function renderPrev() {
  renderUnifiedHub();
}

function renderMissed() {}
function renderUnifiedActivity() { renderUnifiedHub(); }
function renderOfflineMessages() {}
function renderSpotMessages() {}

function reconnectTo(code, name, cid) {
  openChatUnified(code, name, cid, false, 'reconnect');
}

function callBack(code) {
  openChatUnified(code, getContacts()[code] || formatCode(code), buildCID(myCode, code), true, 'callback');
}

function clearMissed() {
  saveMissed([]);
  renderUnifiedHub();
}

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
window.renderSpotMessages = renderSpotMessages;
window.clearSpotMessages = clearSpotMessages;
window.markSpotMessagesRead = markSpotMessagesRead;
window.openSpotChat = openSpotChat;