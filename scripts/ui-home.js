'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// Code-Anzeige, Zifferneingabe, Letzte Chats, Verpasste Anrufe, Offline-Msgs
// + Gruppierte Offline-Nachrichten (eine Karte pro Absender)
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// 6‑stellige Code‑Eingabe
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

// ─────────────────────────────────────────────────────────────────────────────
// Code kopieren / teilen
function copyCode() {
  navigator.clipboard.writeText(myCode)
    .then(() => toast('✅ Code kopiert'))
    .catch(() => toast('Code: ' + myCode));
}

function shareCode() {
  if (navigator.share) {
    navigator.share({
      title: 'SpotMe',
      text: `Mein Code: ${formatCode(myCode)} – schreib mir!`
    });
  } else {
    copyCode();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Letzte Chats anzeigen (renderPrev)
function renderPrev() {
  const arr = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  const sec = document.getElementById('psec');
  const lst = document.getElementById('plist');
  if (!arr.length) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(c => {
    const alias = getContacts()[c.code] || c.partner;
    const preview = c.preview || '—';
    return `<div class="chat-card" onclick="reconnectTo('${c.code}','${esc2(alias)}','${c.id}')">
      <div class="card-row">
        <div class="card-avatar">🧑</div>
        <div class="card-details">
          <div class="card-name">${esc(alias)}</div>
          <div class="card-preview">${esc(preview)}</div>
        </div>
      </div>
      <div class="card-meta">
        <span class="card-time">${timeAgo(c.ts)}</span>
        <span class="card-code">${formatCode(c.code)}</span>
      </div>
    </div>`;
  }).join('');
}

function reconnectTo(code, name, cid) {
  partnerCode = code;
  partnerName = name;
  chatId = cid;
  loadPendingMessages();
  migratePendingMessages(chatId);
  if (!peerReady) {
    toast('📴 Lokaler Modus – Nachrichten werden gespeichert');
    openChat(null);
    setSpill('offline', '○ LOCAL');
    markAutoReconnect();
    return;
  }
  toast('↺ Verbinde...');
  openChat(peer.connect(code, { reliable: true, metadata: { name: myName } }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verpasste Anrufe
function renderMissed() {
  const arr = getMissed();
  const sec = document.getElementById('missed-sec');
  const lst = document.getElementById('missed-list');
  if (!arr.length) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(m => {
    const displayName = getContacts()[m.code] || m.name || formatCode(m.code);
    const d = new Date(m.ts);
    const time = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
                 d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `<div class="chat-card missed-card">
      <div class="card-row">
        <div class="card-avatar">📵</div>
        <div class="card-details">
          <div class="card-name">${esc(displayName)}</div>
          <div class="card-preview">${formatCode(m.code)} · ${time}</div>
        </div>
      </div>
      <button class="call-back-btn" onclick="callBack('${m.code}')">📞 Zurückrufen</button>
    </div>`;
  }).join('');
}

function clearMissed() {
  saveMissed([]);
  renderMissed();
}

function callBack(code) {
  const inps = document.querySelectorAll('.dinp-new');
  code.split('').forEach((ch, i) => {
    if (inps[i]) {
      inps[i].value = ch;
      inps[i].classList.add('filled');
    }
  });
  document.getElementById('cbtn').disabled = false;
  connectToPeer();
  setTimeout(() => {
    inps.forEach(d => { d.value = ''; d.classList.remove('filled'); });
    document.getElementById('cbtn').disabled = true;
  }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline-Nachrichten – GRUPPIERT NACH ABSENDER
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

  // Nach Absender gruppieren
  const grouped = {};
  unread.forEach(m => {
    if (!grouped[m.senderCode]) {
      grouped[m.senderCode] = {
        name: m.senderName,
        code: m.senderCode,
        msgs: []
      };
    }
    grouped[m.senderCode].msgs.push(m);
  });

  const senders = Object.values(grouped);

  lst.innerHTML = senders.map(s => {
    const lastMsg = s.msgs[s.msgs.length - 1];
    const allIds = s.msgs.map(m => m.id);
    const d = new Date(lastMsg.timestamp);
    const time = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
                 ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const initial = s.name ? s.name[0].toUpperCase() : '?';
    const displayName = getContacts()[s.code] || s.name || ('Nutzer_' + s.code.slice(0, 4));
    const msgPreview = s.msgs.length === 1
      ? esc(lastMsg.message)
      : `${s.msgs.length} Nachrichten – letzte: "${esc(lastMsg.message.substring(0, 30))}…"`;

    // Alle Nachrichten dieses Absenders als Liste (für spätere Erweiterung, aktuell nur Vorschau)
    const msgListHtml = s.msgs.map(m => `
      <div style="background:var(--bg);border-radius:10px;padding:0.5rem 0.65rem;margin-bottom:0.4rem;font-size:0.85rem;color:var(--text);line-height:1.4;">
        ${esc(m.message)}
      </div>
    `).join('');

    return `<div class="chat-card missed-card" style="min-width:260px;" id="sender-${s.code}">
      <div class="card-row">
        <div class="card-avatar" style="background:linear-gradient(135deg,var(--p2),var(--p3));">${esc(initial)}</div>
        <div class="card-details">
          <div class="card-name">${esc(displayName)}</div>
          <div class="card-preview" style="color:var(--text-main);margin-top:3px;">${msgPreview}</div>
          <div class="card-preview">${formatCode(s.code)} · ${time}</div>
        </div>
      </div>
      <!-- Nachrichtenliste (einklappbar, zunächst ausgeblendet) -->
      <div class="offline-msg-detail" style="display:none; margin-top:0.5rem; max-height:150px; overflow-y:auto;">
        ${msgListHtml}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
        <button class="call-back-btn" style="background:var(--acc);" onclick="startChatDirect('${s.code}', '${esc2(displayName)}')">💬 Chat</button>
        <button class="call-back-btn" style="background:rgba(123,92,250,0.15);color:var(--p2);border:1px solid rgba(123,92,250,0.3);" onclick="showLeaveMessageSheet('${s.code}', '${esc2(displayName)}')">↩️ Antworten</button>
        <button class="call-back-btn" style="background:rgba(255,255,255,.06);" onclick="dismissSenderOfflineMsgs('${s.code}', [${allIds.join(',')}])">✓ Gelesen</button>
        ${s.msgs.length > 1 ? `<button class="call-back-btn" style="background:rgba(255,255,255,.06);" onclick="toggleSenderMessages('${s.code}')">📋 Alle anzeigen</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// 🆕 Nachrichten eines Absenders ein-/ausblenden
function toggleSenderMessages(code) {
  const card = document.getElementById('sender-' + code);
  const detail = card?.querySelector('.offline-msg-detail');
  if (detail) {
    detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
  }
}

// 🆕 Alle Nachrichten eines Absenders als gelesen markieren
async function dismissSenderOfflineMsgs(senderCode, ids) {
  for (const id of ids) {
    await markOfflineMsgRead(id);
  }
  // Karte entfernen
  const el = document.getElementById('sender-' + senderCode);
  if (el) el.remove();
  const lst = document.getElementById('offline-msg-list');
  if (lst && !lst.children.length) {
    document.getElementById('offline-msg-sec').style.display = 'none';
  }
}

async function dismissOfflineMsg(id) {
  await markOfflineMsgRead(id);
  const el = document.getElementById('offmsg-' + id);
  if (el) el.remove();
  const lst = document.getElementById('offline-msg-list');
  if (lst && !lst.children.length) {
    document.getElementById('offline-msg-sec').style.display = 'none';
  }
}

function startChatDirect(code, name) {
  const inps = document.querySelectorAll('.dinp-new');
  code.split('').forEach((ch, i) => {
    if (inps[i]) {
      inps[i].value = ch;
      inps[i].classList.add('filled');
    }
  });
  document.getElementById('cbtn').disabled = false;
  connectToPeer();
  setTimeout(() => {
    inps.forEach(d => { d.value = ''; d.classList.remove('filled'); });
    document.getElementById('cbtn').disabled = true;
  }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Kontakte umbenennen (aus Home-Kontext)
function renameContact(code, networkName) {
  const current = getContacts()[code] || '';
  const input = prompt(`Spitzname für ${networkName || formatCode(code)}:\n(leer lassen zum Zurücksetzen)`, current);
  if (input === null) return;
  const trimmed = input.trim();
  setAlias(code, trimmed);
  renderPrev();
  toast(trimmed ? `✅ "${trimmed}" gespeichert` : '○ Spitzname entfernt');
                   }
