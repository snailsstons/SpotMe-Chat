'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME MESSENGER – HOME (messenger-home.js)
// Code-Anzeige, Zifferneingabe, Letzte Chats, Offline-Msgs, Verpasste Anfragen
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

function shareCode() {
  const shareUrl = `${window.location.origin}${window.location.pathname}?code=${myCode}`;
  const shareText = `Mein SpotMe-Code: ${formatCode(myCode)} – chatte mit mir!`;
  if (navigator.share) {
    navigator.share({ title: 'SpotMe', text: shareText, url: shareUrl }).catch(() => {});
  } else {
    copyCode();
  }
}

function renderPrev() {
  const arr = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  const sec = document.getElementById('psec');
  const lst = document.getElementById('plist');
  if (!arr.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(c => {
    const alias = getContacts()[c.code] || c.partner;
    const preview = c.preview || '—';
    return `<div class="chat-card" onclick="reconnectTo('${c.code}','${esc2(alias)}','${c.id}')">
      <div class="card-row"><div class="card-avatar">🧑</div><div class="card-details"><div class="card-name">${esc(alias)}</div><div class="card-preview">${esc(preview)}</div></div></div>
      <div class="card-meta"><span class="card-time">${timeAgo(c.ts)}</span><span class="card-code">${formatCode(c.code)}</span></div>
    </div>`;
  }).join('');
}

function reconnectTo(code, name, cid) {
  partnerCode = code; partnerName = name; chatId = cid;
  loadPendingMessages(); migratePendingMessages(chatId);
  if (!peerReady) { toast('📴 Lokaler Modus'); openChat(null); markAutoReconnect(); return; }
  openChat(peer.connect(code, { reliable: true, metadata: { name: myName } }));
}

function renderMissed() {
  const arr = getMissed();
  const sec = document.getElementById('missed-sec');
  const lst = document.getElementById('missed-list');
  if (!arr.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(m => {
    const displayName = getContacts()[m.code] || m.name || formatCode(m.code);
    const d = new Date(m.ts);
    const time = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    return `<div class="chat-card missed-card">
      <div class="card-row"><div class="card-avatar">📵</div><div class="card-details"><div class="card-name">${esc(displayName)}</div><div class="card-preview">${formatCode(m.code)} · ${time}</div></div></div>
      <button class="call-back-btn" onclick="callBack('${m.code}')">📞 Zurückrufen</button>
    </div>`;
  }).join('');
}

function clearMissed() { saveMissed([]); renderMissed(); }

function callBack(code) {
  const inps = document.querySelectorAll('.dinp-new');
  code.split('').forEach((ch, i) => { if (inps[i]) { inps[i].value = ch; inps[i].classList.add('filled'); } });
  document.getElementById('cbtn').disabled = false;
  connectToPeer();
  setTimeout(() => { inps.forEach(d => { d.value = ''; d.classList.remove('filled'); }); document.getElementById('cbtn').disabled = true; }, 200);
}

function renderOfflineMessages(msgs) {
  const sec = document.getElementById('offline-msg-sec');
  const lst = document.getElementById('offline-msg-list');
  if (!sec || !lst) return;
  const unread = msgs.filter(m => !m.read);
  if (!unread.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  lst.innerHTML = unread.map(m => {
    const d = new Date(m.timestamp);
    const time = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const displayName = getContacts()[m.senderCode] || m.senderName || ('Nutzer_' + m.senderCode.slice(0,4));
    return `<div class="chat-card missed-card" id="offmsg-${m.id}">
      <div class="card-row"><div class="card-avatar">✉️</div><div class="card-details"><div class="card-name">${esc(displayName)}</div><div class="card-preview">${esc(m.message)}</div><div class="card-preview">${formatCode(m.senderCode)} · ${time}</div></div></div>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
        <button class="call-back-btn" onclick="callBack('${m.senderCode}')">📞 Zurückrufen</button>
        <button class="call-back-btn" onclick="dismissOfflineMsg(${m.id})">✓ Gelesen</button>
      </div>
    </div>`;
  }).join('');
}

async function dismissOfflineMsg(id) {
  await markOfflineMsgRead(id);
  const el = document.getElementById('offmsg-' + id);
  if (el) el.remove();
  if (!document.querySelectorAll('#offline-msg-list .chat-card').length) {
    document.getElementById('offline-msg-sec').style.display = 'none';
  }
                                                                            }
