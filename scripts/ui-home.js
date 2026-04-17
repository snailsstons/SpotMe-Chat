'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// + Kontaktliste aus sm_idx & Offline-Nachrichten (Badges)
// ══════════════════════════════════════════════════════════════════════════════

// ... (initDigits, copyCode, shareCode unverändert)

// ─────────────────────────────────────────────────────────────────────────────
// Kontaktliste rendern (ersetzt renderPrev)
async function renderPrev() {
  const lst = document.getElementById('plist');
  if (!lst) return;

  // 1. sm_idx laden
  const idx = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  
  // 2. Ungelesene Offline‑Nachrichten vom Server holen
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

  // 3. Kombinierte Liste erstellen
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

  // Absender von ungelesenen Nachrichten, die noch nicht in sm_idx sind
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
    return `<div class="chat-card" onclick="reconnectTo('${c.code}','${esc2(alias)}','${c.id || ('sm_' + [myCode, c.code].sort().join('_'))}')">
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

// ... (restliche Funktionen: reconnectTo, renderMissed, clearMissed, callBack, renderOfflineMessages, etc. bleiben unverändert)
