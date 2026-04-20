'use strict';

console.log('✅ ui-home.js v5.0 geladen – Final mit Status-Fix');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// Unified Activity Feed – Chats & Kurznachrichten getrennt mit Tags
// + chatId-Fix + Status-Fix + Fallback deaktiviert
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
// CHAT AKTIVITÄTEN (NUR echte Chats aus sm_idx) – MIT TAG
// ══════════════════════════════════════════════════════════════════════════════

async function renderUnifiedActivity() {
  const lst = document.getElementById('plist');
  const sec = document.getElementById('psec');
  if (!lst || !sec) return;

  const idx = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  const missed = getMissed();

  let unreadCounts = {};
  if (myToken) {
    try {
      const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
      if (res.ok) {
        const msgs = await res.json();
        msgs.filter(m => !m.read).forEach(m => {
          unreadCounts[m.senderCode] = (unreadCounts[m.senderCode] || 0) + 1;
        });
      }
    } catch (e) {}
  }

  const contacts = new Map();

  idx.forEach(c => {
    const code = c.code;
    if (!contacts.has(code)) {
      contacts.set(code, {
        code,
        name: c.partner || getContacts()[code] || formatCode(code),
        chat: null,
        missedCall: null,
        unread: unreadCounts[code] || 0
      });
    }
    const entry = contacts.get(code);
    if (!entry.chat || c.ts > entry.chat.ts) {
      entry.chat = {
        preview: c.preview || '—',
        ts: c.ts,
        chatId: c.id || buildCID(myCode, code)
      };
    }
  });

  missed.forEach(m => {
    const code = m.code;
    if (!contacts.has(code)) {
      contacts.set(code, {
        code,
        name: m.name || getContacts()[code] || formatCode(code),
        chat: null,
        missedCall: null,
        unread: unreadCounts[code] || 0
      });
    }
    const entry = contacts.get(code);
    if (!entry.missedCall || m.ts > entry.missedCall.ts) {
      entry.missedCall = {
        message: m.message || '',
        ts: m.ts
      };
    }
  });

  Object.keys(unreadCounts).forEach(code => {
    if (!contacts.has(code)) {
      contacts.set(code, {
        code,
        name: getContacts()[code] || formatCode(code),
        chat: null,
        missedCall: null,
        unread: unreadCounts[code]
      });
    }
  });

  const contactArray = Array.from(contacts.values())
    .map(c => {
      const latestTs = Math.max(c.chat?.ts || 0, c.missedCall?.ts || 0);
      return { ...c, latestTs };
    })
    .sort((a, b) => b.latestTs - a.latestTs);

  if (contactArray.length === 0) {
    sec.style.display = 'block';
    lst.innerHTML = '<div class="empty-state">✨ Noch keine Chats</div>';
    return;
  }

  sec.style.display = 'block';

  lst.innerHTML = contactArray
    .map(c => {
      const alias = esc(c.name);
      const unreadBadge = c.unread > 0 ? `<span class="unread-badge">${c.unread}</span>` : '';

      let activityIcon = '💬';
      let activityText = '';
      let activityTime = '';
      let hasMissedCall = false;

      if (c.chat) {
        activityIcon = '💬';
        activityText = c.chat.preview;
        activityTime = formatRelativeTime(c.chat.ts);
      }

      if (c.missedCall) {
        hasMissedCall = true;
        if (!c.chat) {
          activityIcon = '📵';
          activityText = c.missedCall.message
            ? `Verpasst: "${c.missedCall.message.substring(0, 40)}${c.missedCall.message.length > 40 ? '…' : ''}"`
            : '📵 Verpasster Anruf';
        }
        activityTime = formatRelativeTime(c.missedCall.ts);
      }

      if (!c.chat && !c.missedCall) {
        activityIcon = '📨';
        activityText = `${c.unread} neue Nachricht${c.unread > 1 ? 'en' : ''}`;
        activityTime = 'Jetzt';
      }

      const timeStr = activityTime;
      const chatId = c.chat?.chatId || buildCID(myCode, c.code);

      const missedInfoHtml =
        c.chat && c.missedCall
          ? `<div class="missed-call-indicator" style="display:flex;align-items:center;gap:4px;margin-top:4px;font-size:0.75rem;color:var(--p2);">
               <span>📵</span>
               <span>${c.missedCall.message ? `Verpasst: "${esc(c.missedCall.message.substring(0, 30))}${c.missedCall.message.length > 30 ? '…' : ''}"` : 'Verpasster Anruf'}</span>
             </div>`
          : '';

      const buttonText = hasMissedCall ? '📞 Zurückrufen' : '💬 Chat';
      const buttonColor = 'var(--acc)';

      return `
      <div class="chat-card unified-activity-card" style="position:relative;">
        <div class="card-row" style="align-items:flex-start;">
          <div class="card-avatar" style="background:linear-gradient(135deg,var(--p2),var(--p3));">
            ${alias[0]?.toUpperCase() || '?'}
          </div>
          <div class="card-details" style="flex:1;">
            <div style="margin-bottom:4px;">
              <span style="background:var(--p2);color:white;padding:3px 10px;border-radius:20px;font-size:0.65rem;font-weight:600;letter-spacing:0.3px;">💬 CHAT</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div class="card-name" style="display:flex;align-items:center;gap:6px;">
                ${alias} ${unreadBadge}
              </div>
              <span class="card-time" style="font-size:0.75rem;color:var(--text-dim);">${timeStr}</span>
            </div>
            <div class="card-preview" style="margin-top:2px;display:flex;align-items:center;gap:4px;">
              <span style="opacity:0.7;">${activityIcon}</span>
              <span style="color:var(--text-dim);">${esc(activityText)}</span>
            </div>
            ${missedInfoHtml}
            <div style="color:var(--text-dim);font-size:0.7rem;margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>${formatCode(c.code)}</span>
              ${c.missedCall ? `<span style="opacity:0.7;">📵 ${formatRelativeTime(c.missedCall.ts)}</span>` : ''}
            </div>
          </div>
        </div>
        
        <div style="display:flex;margin-top:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
          <button class="unified-action-btn" 
                  onclick="event.stopPropagation(); openChatUnified('${c.code}', '${esc2(c.name)}', '${chatId}', ${hasMissedCall}, 'chat')"
                  style="flex:1;padding:12px;border-radius:30px;border:none;background:${buttonColor};
                         color:white;font-weight:600;cursor:pointer;font-size:1rem;
                         display:flex;align-items:center;justify-content:center;gap:8px;">
            <span>${buttonText}</span>
          </button>
        </div>
      </div>
    `;
    })
    .join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// KURZNACHRICHTEN (SPOT) – SEPARAT MIT SPOT-TAG
// ══════════════════════════════════════════════════════════════════════════════

function renderSpotMessages() {
  const sec = document.getElementById('spot-msg-sec');
  const lst = document.getElementById('spot-msg-list');
  if (!sec || !lst) return;

  const msgs = getSpotMessages();
  const unread = msgs.filter(m => !m.read);
  if (!unread.length) {
    sec.style.display = 'none';
    return;
  }

  sec.style.display = 'block';

  const grouped = {};
  unread.forEach(m => {
    if (!grouped[m.code]) {
      grouped[m.code] = {
        name: m.name || formatCode(m.code),
        code: m.code,
        spotType: m.spotType || 'SPOT',
        msgs: []
      };
    }
    grouped[m.code].msgs.push(m);
  });

  const senders = Object.values(grouped);

  lst.innerHTML = senders
    .map(s => {
      const lastMsg = s.msgs[s.msgs.length - 1];
      const time = new Date(lastMsg.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const initial = s.name ? s.name[0].toUpperCase() : '?';
      const displayName = s.name;

      return `
      <div class="chat-card spot-card" style="min-width:260px;" onclick="openSpotChat('${s.code}')">
        <div class="card-row">
          <div class="card-avatar" style="background:linear-gradient(135deg,#00e5c0,#009688);">${esc(initial)}</div>
          <div class="card-details">
            <div style="margin-bottom:4px;">
              <span style="background:#00e5c0;color:#000;padding:3px 10px;border-radius:20px;font-size:0.65rem;font-weight:600;letter-spacing:0.3px;">📟 ${s.spotType}</span>
            </div>
            <div class="card-name">${esc(displayName)}</div>
            <div class="card-preview" style="color:var(--text-dim);">${esc(lastMsg.message)}</div>
            <div class="card-time" style="font-size:0.7rem;color:var(--text-dim);">${time}</div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem;">
          <button class="call-back-btn" style="background:var(--acc);" onclick="event.stopPropagation(); openSpotChat('${s.code}')">💬 Antworten</button>
          <button class="call-back-btn" style="background:rgba(255,255,255,0.1);" onclick="event.stopPropagation(); markSpotMessagesRead('${s.code}')">✓ Gelesen</button>
        </div>
      </div>
    `;
    })
    .join('');
}

function openSpotChat(code) {
  const name = getContacts()[code] || formatCode(code);
  openChatUnified(code, name, buildCID(myCode, code), false, 'spot');
  markSpotMessagesRead(code);
}

function markSpotMessagesRead(code) {
  const msgs = getSpotMessages();
  const updated = msgs.filter(m => m.code !== code);
  saveSpotMessages(updated);
  renderSpotMessages();
}

function clearSpotMessages() {
  saveSpotMessages([]);
  renderSpotMessages();
  toast('✓ Alle Kurznachrichten als gelesen markiert');
}

// ══════════════════════════════════════════════════════════════════════════════
// EINHEITLICHE CHAT-ÖFFNEN FUNKTION – MIT ALLEN FIXES
// ══════════════════════════════════════════════════════════════════════════════

function openChatUnified(code, name, chatId, isCallback = false, source = 'chat') {
  console.log('💬 openChatUnified →', code, name, chatId, 'source:', source);

  if (code === myCode) {
    toast('⚠️ Du kannst nicht mit dir selbst chatten');
    return;
  }

  // 🆕 chatId ERZWINGEN – niemals undefined
  if (!chatId || chatId === 'undefined') {
    chatId = buildCID(myCode, code);
  }

  // 🆕 Source speichern
  window.chatSource = source;

  // LIVE-Modus setzen
  isOffline = false;
  window.isOffline = false;

  partnerCode = code;
  partnerName = name;
  window.chatId = chatId;
  chatId = chatId; // globale Variable

  console.log('✅ chatId gesetzt:', chatId);

  loadPendingMessages();
  migratePendingMessages(chatId);

  if (typeof showCallModal === 'function') {
    showCallModal('📞 Verbinde...', `${name} (${formatCode(code)})`);
  }

  if (typeof openApiChat === 'function') {
    openApiChat();
  } else {
    toast('⚠️ Fehler beim Öffnen des Chats');
    return;
  }

  // 🆕 Status SOFORT auf ONLINE setzen
  setTimeout(() => {
    isOffline = false;
    window.isOffline = false;
    setSpill('online', '● ONLINE');
    updateConnectionStatus();
    
    // 🆕 Avatar-Status auf ONLINE setzen
    const pav = document.getElementById('pav');
    if (pav) pav.className = 'pav';
    const pstatus = document.getElementById('pstatus');
    if (pstatus) pstatus.textContent = '● ONLINE';
    
    console.log('✅ Status auf ONLINE gesetzt');
  }, 50); // Sofort, aber nach DOM-Update

  if (myToken) {
    sendChatRequest(code);
  }

  toast(`📞 Rufe ${name} an...`);

  // 🆕 Fallback-Timer DEAKTIVIERT für Beta
  // Bleibt immer im Live-Modus
  console.log('⏰ Fallback-Timer DEAKTIVIERT – bleibe im Live-Modus');
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

// ══════════════════════════════════════════════════════════════════════════════
// OFFLINE NACHRICHTEN (Server-Polling)
// ══════════════════════════════════════════════════════════════════════════════

function renderOfflineMessages(msgs) {
  const sec = document.getElementById('offline-msg-sec');
  const lst = document.getElementById('offline-msg-list');
  if (!sec || !lst) return;
  const unread = msgs.filter(m => !m.read);
  if (!unread.length) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';

  const grouped = {};
  unread.forEach(m => {
    if (!grouped[m.senderCode]) grouped[m.senderCode] = { name: m.senderName, code: m.senderCode, msgs: [] };
    grouped[m.senderCode].msgs.push(m);
  });

  const senders = Object.values(grouped);

  lst.innerHTML = senders
    .map(s => {
      const lastMsg = s.msgs[s.msgs.length - 1];
      const allIds = s.msgs.map(m => m.id);
      const d = new Date(lastMsg.timestamp);
      const time =
        d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const initial = s.name ? s.name[0].toUpperCase() : '?';
      const displayName = getContacts()[s.code] || s.name || 'Nutzer_' + s.code.slice(0, 4);
      const msgPreview =
        s.msgs.length === 1
          ? esc(lastMsg.message)
          : `${s.msgs.length} Nachrichten – letzte: "${esc(lastMsg.message.substring(0, 30))}…"`;
      const msgListHtml = s.msgs
        .map(
          m =>
            `<div style="background:var(--bg);border-radius:10px;padding:0.5rem 0.65rem;margin-bottom:0.4rem;font-size:0.85rem;color:var(--text);line-height:1.4;">${esc(m.message)}</div>`
        )
        .join('');

      return `<div class="chat-card missed-card" style="min-width:260px;" id="sender-${s.code}">
      <div class="card-row">
        <div class="card-avatar" style="background:linear-gradient(135deg,var(--p2),var(--p3));">${esc(initial)}</div>
        <div class="card-details">
          <div class="card-name">${esc(displayName)}</div>
          <div class="card-preview" style="color:var(--text);margin-top:3px;">${msgPreview}</div>
          <div class="card-preview" style="color:var(--text-dim);">${formatCode(s.code)} · ${time}</div>
        </div>
      </div>
      <div class="offline-msg-detail" style="display:none; margin-top:0.5rem; max-height:150px; overflow-y:auto; color:var(--text);">${msgListHtml}</div>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
        <button class="call-back-btn" style="background:var(--acc);" onclick="openChatUnified('${s.code}', '${esc2(displayName)}', '${buildCID(myCode, s.code)}', false, 'offline')">💬 Chat</button>
        <button class="call-back-btn" style="background:rgba(123,92,250,0.15);color:var(--p2);border:1px solid rgba(123,92,250,0.3);" onclick="showLeaveMessageSheet('${s.code}', '${esc2(displayName)}')">↩️ Antworten</button>
        <button class="call-back-btn" style="background:rgba(255,255,255,.06);" onclick="dismissSenderOfflineMsgs('${s.code}', [${allIds.join(',')}])">✓ Gelesen</button>
        ${s.msgs.length > 1 ? `<button class="call-back-btn" style="background:rgba(255,255,255,0.1);" onclick="toggleSenderMessages('${s.code}')">📋 Alle anzeigen</button>` : ''}
      </div>
    </div>`;
    })
    .join('');
}

function toggleSenderMessages(code) {
  const card = document.getElementById('sender-' + code);
  const detail = card?.querySelector('.offline-msg-detail');
  if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
}

async function dismissSenderOfflineMsgs(senderCode, ids) {
  for (const id of ids) await markOfflineMsgRead(id);
  const el = document.getElementById('sender-' + senderCode);
  if (el) el.remove();
  if (!document.querySelectorAll('#offline-msg-list .chat-card').length)
    document.getElementById('offline-msg-sec').style.display = 'none';
}

function renameContact(code, networkName) {
  const current = getContacts()[code] || '';
  const input = prompt(`Spitzname für ${networkName || formatCode(code)}:\n(leer lassen zum Zurücksetzen)`, current);
  if (input === null) return;
  const trimmed = input.trim();
  setAlias(code, trimmed);
  renderUnifiedActivity();
  toast(trimmed ? `✅ "${trimmed}" gespeichert` : '○ Spitzname entfernt');
}

// ══════════════════════════════════════════════════════════════════════════════
// KOMPATIBILITÄT
// ══════════════════════════════════════════════════════════════════════════════

function renderPrev() {
  renderUnifiedActivity();
  renderSpotMessages();
}

function renderMissed() {}

function reconnectTo(code, name, cid) {
  openChatUnified(code, name, cid, false, 'reconnect');
}

function callBack(code) {
  openChatUnified(code, getContacts()[code] || formatCode(code), buildCID(myCode, code), true, 'callback');
}

function clearMissed() {
  saveMissed([]);
  renderUnifiedActivity();
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

window.connectToPeer = connectToPeer;
window.openChatUnified = openChatUnified;
window.renderSpotMessages = renderSpotMessages;
window.clearSpotMessages = clearSpotMessages;
window.markSpotMessagesRead = markSpotMessagesRead;
window.openSpotChat = openSpotChat;