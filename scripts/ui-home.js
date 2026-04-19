'use strict';

console.log('✅ ui-home.js v3.1 geladen – Unified Activity Feed (Final)');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// Unified Activity Feed – Ein Button: 💬 Chat
// Standard: LIVE mit automatischem Lokal-Fallback
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
        inps[i - 1].value = ''; inps[i - 1].classList.remove('filled');
        inps[i - 1].focus(); document.getElementById('cbtn').disabled = true;
      }
    });
    p.addEventListener('paste', e => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      txt.split('').forEach((ch, j) => {
        if (inps[i + j]) { inps[i + j].value = ch; inps[i + j].classList.add('filled'); }
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
    try { await navigator.share({ title: 'SpotMe', text, url }); } catch (e) {}
  } else {
    copyCode();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED ACTIVITY FEED
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

  const contactArray = Array.from(contacts.values()).map(c => {
    const latestTs = Math.max(c.chat?.ts || 0, c.missedCall?.ts || 0);
    return { ...c, latestTs };
  }).sort((a, b) => b.latestTs - a.latestTs);

  if (contactArray.length === 0) {
    sec.style.display = 'block';
    lst.innerHTML = '<div class="empty-state">✨ Noch keine Aktivitäten</div>';
    return;
  }

  sec.style.display = 'block';

  lst.innerHTML = contactArray.map(c => {
    const alias = esc(c.name);
    const unreadBadge = c.unread > 0 
      ? `<span class="unread-badge">${c.unread}</span>` 
      : '';
    
    let activityIcon = '💬';
    let activityText = '';
    let activityTime = '';
    let hasMissedCall = false;
    let missedMessage = '';
    
    if (c.chat) {
      activityIcon = '💬';
      activityText = c.chat.preview;
      activityTime = formatRelativeTime(c.chat.ts);
    }
    
    if (c.missedCall) {
      hasMissedCall = true;
      missedMessage = c.missedCall.message;
      if (!c.chat) {
        activityIcon = '📵';
        activityText = missedMessage 
          ? `Verpasst: "${missedMessage.substring(0, 40)}${missedMessage.length > 40 ? '…' : ''}"`
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
    
    const missedInfoHtml = (c.chat && c.missedCall) 
      ? `<div class="missed-call-indicator" style="display:flex;align-items:center;gap:4px;margin-top:4px;font-size:0.75rem;color:var(--p2);">
           <span>📵</span>
           <span>${c.missedCall.message ? `Verpasst: "${esc(c.missedCall.message.substring(0, 30))}${c.missedCall.message.length > 30 ? '…' : ''}"` : 'Verpasster Anruf'}</span>
         </div>`
      : '';

    const buttonText = hasMissedCall ? '📞 Zurückrufen' : '💬 Chat';
    const buttonColor = hasMissedCall ? 'var(--acc)' : 'var(--acc)';

    return `
      <div class="chat-card unified-activity-card" style="position:relative;">
        <div class="card-row" style="align-items:flex-start;">
          <div class="card-avatar" style="background:linear-gradient(135deg,var(--p2),var(--p3));">
            ${alias[0]?.toUpperCase() || '?'}
          </div>
          <div class="card-details" style="flex:1;">
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
        
        <!-- EIN BUTTON FÜR ALLES -->
        <div style="display:flex;margin-top:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
          <button class="unified-action-btn" 
                  onclick="event.stopPropagation(); openChatUnified('${c.code}', '${esc2(c.name)}', '${chatId}', ${hasMissedCall})"
                  style="flex:1;padding:12px;border-radius:30px;border:none;background:${buttonColor};
                         color:white;font-weight:600;cursor:pointer;font-size:1rem;
                         display:flex;align-items:center;justify-content:center;gap:8px;">
            <span>${buttonText}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// EINHEITLICHE CHAT-ÖFFNEN FUNKTION
// ══════════════════════════════════════════════════════════════════════════════
function openChatUnified(code, name, chatId, isCallback = false) {
  console.log('💬 openChatUnified →', code, name, chatId, 'isCallback:', isCallback);
  
  if (code === myCode) {
    toast('⚠️ Du kannst nicht mit dir selbst chatten');
    return;
  }
  
  // ⭐ ERST DEN MODUS SETZEN, DANN ALLES ANDERE
  isOffline = false;
  window.isOffline = false;
  
  partnerCode = code;
  partnerName = name;
  chatId = chatId || buildCID(myCode, code);
  window.chatId = chatId;
  
  console.log('✅ isOffline vor openApiChat:', isOffline);
  
  loadPendingMessages();
  migratePendingMessages(chatId);
  
  // Modal anzeigen
  if (typeof showCallModal === 'function') {
    showCallModal('📞 Verbinde...', `${name} (${formatCode(code)})`);
  }
  
  // Chat-UI öffnen
  if (typeof openApiChat === 'function') {
    openApiChat();
  } else {
    toast('⚠️ Fehler beim Öffnen des Chats');
    return;
  }
  
  // Status NOCHMAL setzen (nach openApiChat)
  setTimeout(() => {
    isOffline = false;
    window.isOffline = false;
    setSpill('online', '● ONLINE');
    updateConnectionStatus();
    console.log('✅ isOffline nach Korrektur:', isOffline);
  }, 100);
  
  // Chat-Request senden
  if (myToken) {
    sendChatRequest(code);
  }
  
  toast(`📞 Rufe ${name} an...`);
  
  // Fallback NUR wenn wirklich keine Verbindung
  window.chatFallbackTimer = setTimeout(() => {
    // Prüfen ob wir noch im gleichen Chat sind
    if (partnerCode === code) {
      console.log('⏰ Keine Antwort – schalte auf Lokal-Modus');
      isOffline = true;
      window.isOffline = true;
      setSpill('offline', '● LOCAL');
      updateConnectionStatus();
      
      const h = document.getElementById('ehint');
      if (h) {
        h.innerHTML = `<div class="empty-icon">📴</div>
          <div class="empty-txt" style="font-weight:600;color:var(--text)">Lokaler Modus</div>
          <div class="empty-hint">Partner nicht erreichbar – Nachrichten werden später zugestellt</div>`;
      }
      
      toast('📴 Partner nicht erreichbar – Lokaler Modus aktiv');
    }
    window.chatFallbackTimer = null;
  }, 15000); // 15 Sekunden warten
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
  } catch (e) {
    console.warn('Chat-Request fehlgeschlagen:', e);
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
// OFFLINE NACHRICHTEN
// ══════════════════════════════════════════════════════════════════════════════

function renderOfflineMessages(msgs) {
  const sec = document.getElementById('offline-msg-sec');
  const lst = document.getElementById('offline-msg-list');
  if (!sec || !lst) return;
  const unread = msgs.filter(m => !m.read);
  if (!unread.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  const grouped = {};
  unread.forEach(m => {
    if (!grouped[m.senderCode]) grouped[m.senderCode] = { name: m.senderName, code: m.senderCode, msgs: [] };
    grouped[m.senderCode].msgs.push(m);
  });

  const senders = Object.values(grouped);

  lst.innerHTML = senders.map(s => {
    const lastMsg = s.msgs[s.msgs.length - 1];
    const allIds = s.msgs.map(m => m.id);
    const d = new Date(lastMsg.timestamp);
    const time = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const initial = s.name ? s.name[0].toUpperCase() : '?';
    const displayName = getContacts()[s.code] || s.name || ('Nutzer_' + s.code.slice(0, 4));
    const msgPreview = s.msgs.length === 1 ? esc(lastMsg.message) : `${s.msgs.length} Nachrichten – letzte: "${esc(lastMsg.message.substring(0, 30))}…"`;
    const msgListHtml = s.msgs.map(m => `<div style="background:var(--bg);border-radius:10px;padding:0.5rem 0.65rem;margin-bottom:0.4rem;font-size:0.85rem;color:var(--text);line-height:1.4;">${esc(m.message)}</div>`).join('');

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
        <button class="call-back-btn" style="background:var(--acc);" onclick="openChatUnified('${s.code}', '${esc2(displayName)}', '${buildCID(myCode, s.code)}', false)">💬 Chat</button>
        <button class="call-back-btn" style="background:rgba(123,92,250,0.15);color:var(--p2);border:1px solid rgba(123,92,250,0.3);" onclick="showLeaveMessageSheet('${s.code}', '${esc2(displayName)}')">↩️ Antworten</button>
        <button class="call-back-btn" style="background:rgba(255,255,255,.06);" onclick="dismissSenderOfflineMsgs('${s.code}', [${allIds.join(',')}])">✓ Gelesen</button>
        ${s.msgs.length > 1 ? `<button class="call-back-btn" style="background:rgba(255,255,255,0.1);" onclick="toggleSenderMessages('${s.code}')">📋 Alle anzeigen</button>` : ''}
      </div>
    </div>`;
  }).join('');
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
  if (!document.querySelectorAll('#offline-msg-list .chat-card').length) document.getElementById('offline-msg-sec').style.display = 'none';
}

async function dismissOfflineMsg(id) {
  await markOfflineMsgRead(id);
  const el = document.getElementById('offmsg-' + id);
  if (el) el.remove();
  if (!document.querySelectorAll('#offline-msg-list .chat-card').length) document.getElementById('offline-msg-sec').style.display = 'none';
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

function renderPrev() { renderUnifiedActivity(); }
function renderMissed() { }
function reconnectTo(code, name, cid) { openChatUnified(code, name, cid, false); }
function callBack(code) { openChatUnified(code, getContacts()[code] || formatCode(code), buildCID(myCode, code), true); }
function clearMissed() { saveMissed([]); renderUnifiedActivity(); }

// Für "Chat starten" Button (LIVE)
function connectToPeer() {
  const code = getDigits();
  if (code.length !== 6 || code === myCode) return;
  
  const name = localName(code);
  openChatUnified(code, name, buildCID(myCode, code), false);
  
  document.querySelectorAll('.dinp-new').forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
  document.getElementById('cbtn').disabled = true;
}

window.connectToPeer = connectToPeer;
window.openChatUnified = openChatUnified;
