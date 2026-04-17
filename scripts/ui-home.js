'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// + initDigits, getDigits, copyCode, shareCode, renderPrev
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

async function renderPrev() {
  const lst = document.getElementById('plist');
  if (!lst) return;

  const idx = JSON.parse(localStorage.getItem('sm_idx') || '[]');
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

  const contacts = [];
  const seen = new Set();

  idx.forEach(c => {
    if (!seen.has(c.code)) {
      seen.add(c.code);
      contacts.push({
        code: c.code,
        name: c.partner || formatCode(c.code),
        preview: c.preview || '—',
        ts: c.ts,
        unread: unreadCounts[c.code] || 0
      });
    }
  });

  Object.keys(unreadCounts).forEach(code => {
    if (!seen.has(code)) {
      contacts.push({
        code: code,
        name: formatCode(code),
        preview: 'Neue Nachricht',
        ts: Date.now(),
        unread: unreadCounts[code]
      });
    }
  });

  contacts.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const sec = document.getElementById('psec');
  if (contacts.length === 0) {
    sec.style.display = 'block';
    lst.innerHTML = '<div class="empty-state">Noch keine Chats</div>';
    return;
  }

  sec.style.display = 'block';
  lst.innerHTML = contacts.map(c => {
    const alias = c.name;
    const unreadBadge = c.unread > 0 ? `<span class="unread-badge">${c.unread}</span>` : '';
    const timeStr = c.ts ? new Date(c.ts).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '';
    const chatId = c.id || ('sm_' + [myCode, c.code].sort().join('_'));
    return `<div class="chat-card" onclick="reconnectTo('${c.code}','${esc2(alias)}','${chatId}')">
      <div class="card-row">
        <div class="card-avatar">🧑</div>
        <div class="card-details">
          <div class="card-name">${esc(alias)} ${unreadBadge}</div>
          <div class="card-preview">${esc(c.preview || '—')}</div>
        </div>
      </div>
      <div class="card-meta">
        <span class="card-time">${timeStr}</span>
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

// renderMissed, clearMissed, callBack, renderOfflineMessages, etc. bleiben unverändert
// (Aus Platzgründen hier nicht vollständig wiederholt – sie sind in deiner bestehenden ui-home.js enthalten)
